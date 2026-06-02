require('dotenv').config();

module.exports = {
    // Server Config
    port: process.env.PORT || 5000,
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Encryption
    encryption: {
        photoKey: process.env.PHOTO_ENCRYPTION_KEY || 'default-32-char-encryption-key!'
    },
    
    // Session Config
    session: {
        codeValidityMinutes: parseInt(process.env.SESSION_CODE_VALIDITY_MINUTES) || 10,
        maxOfflineSyncHours: parseInt(process.env.MAX_OFFLINE_SYNC_HOURS) || 24
    },
    
    // File Upload Config
    upload: {
        dir: process.env.UPLOAD_DIR || './uploads',
        maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB) || 5
    },
    
    // Rate Limiting
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
    },
    
    // CORS
    cors: {
        origins: process.env.CORS_ORIGINS
            ? process.env.CORS_ORIGINS
                .split(',')
                .map((origin) => String(origin).trim())
                .filter(Boolean)
            : ['http://localhost:3000']
    },

    // Internal / trusted-source controls (disabled by default)
    internal: {
        // If set, allows trusted callers (still authenticated) to submit attendance by sessionId without a session code.
        // Provide via header: X-Hexad-Internal-Key: <value>
        attendanceBypassKey: process.env.INTERNAL_ATTENDANCE_BYPASS_KEY || null
    }
};
