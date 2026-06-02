require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { initFirebaseAdmin } = require('./firebase/firebase');
const { startAttendanceAutoVerifyJob } = require('./jobs/attendanceAutoVerify');

const app = express();

// Trust proxy so rate limiting and IP detection work correctly when behind
// a local dev proxy (CRA) or production reverse proxy.
app.set('trust proxy', config.nodeEnv === 'development' ? 'loopback' : 1);

// Security middleware
app.use(helmet());

// CORS
const normalizeOrigin = (origin) => {
    if (!origin) return origin;
    // Normalize minor differences like trailing slashes and whitespace.
    return String(origin).trim().replace(/\/+$/, '');
};

const allowedOrigins = new Set((config.cors.origins || []).map(normalizeOrigin));

app.use(cors({
    origin: (origin, callback) => {
        // Requests like curl/postman often don't send Origin; allow those.
        if (!origin) return callback(null, true);

        const normalized = normalizeOrigin(origin);
        if (allowedOrigins.has(normalized)) return callback(null, true);

        // Disallow by default (no CORS headers will be added).
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Hexad-Internal-Key', 'X-Internal-Key'],
    optionsSuccessStatus: 204
}));

// Rate limiting
const isDev = config.nodeEnv === 'development';

const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    // Auth endpoints should be protected, but not so strict that dev usage locks you out.
    max: isDev ? 1000 : Math.max(50, Math.floor(config.rateLimit.maxRequests / 2)),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests, please try again later.'
    }
});

const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: isDev ? 5000 : config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Never let the global limiter block auth bootstrap calls.
        // `req.path` here is the path *within* the /api mount, e.g. `/auth/me`.
        return String(req.path || '').startsWith('/auth');
    },
    message: {
        success: false,
        message: 'Too many requests, please try again later.'
    }
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api', routes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = config.port;

const startServer = async () => {
    try {
        // Initialize Firebase Admin (Realtime DB + Auth)
        initFirebaseAdmin();
        console.log('✅ Firebase Admin initialized');

        // Background job: auto-verify absent+unverified records after 6 hours from session end.
        startAttendanceAutoVerifyJob();
        
        const server = app.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    HEXAD API SERVER                       ║
╠═══════════════════════════════════════════════════════════╣
║  Status:      Running                                     ║
║  Port:        ${PORT}                                         ║
║  Environment: ${config.nodeEnv.padEnd(39)}║
║  API Base:    http://localhost:${PORT}/api                    ║
╚═══════════════════════════════════════════════════════════╝
            `);
        });

        server.on('error', (err) => {
            if (err && err.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} is already in use. Stop the other process or set PORT to a free port.`);
            } else {
                console.error('❌ Server listen error:', err);
            }
            process.exit(1);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

startServer();

module.exports = app;
