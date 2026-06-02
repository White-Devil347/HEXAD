const express = require('express');
const cors = require('cors');
const path = require('path');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const studentsRouter = require('./routes/students');
const exportRouter = require('./routes/export');
const sessionsRouter = require('./routes/sessions');
const simulationRouter = require('./routes/simulation');
const configRouter = require('./routes/config');
const schemaRouter = require('./routes/schema');

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// API Routes
app.use('/api/students', studentsRouter);
app.use('/api/export', exportRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/simulation', simulationRouter);
app.use('/api/config', configRouter);
app.use('/api/schema', schemaRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    internalKeyPresent: Boolean(process.env.HEXAD_INTERNAL_KEY),
  });
});

// Serve static files (React build)
const buildPath = path.join(__dirname, '../client/build');
app.use(express.static(buildPath));

// SPA fallback: serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).json({ error: 'Not found' });
    }
  });
});

// Error handling
app.use(errorHandler);

module.exports = app;
