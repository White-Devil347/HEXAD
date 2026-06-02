const express = require('express');
const router = express.Router();

const systemHealth = require('../utils/systemHealth');

// Import route modules
const authRoutes = require('./auth');
const teacherRoutes = require('./teacher');
const adminRoutes = require('./admin');
const superadminRoutes = require('./superadmin');
const studentRoutes = require('./student');
const schemaRoutes = require('./schema');
const publicRoutes = require('./public');

// API Routes
router.use('/auth', authRoutes);
router.use('/schema', schemaRoutes);
router.use('/public', publicRoutes);
router.use('/teacher', teacherRoutes);
router.use('/student', studentRoutes);
router.use('/admin', adminRoutes);
router.use('/superadmin', superadminRoutes);

// Health check
router.get('/health', async (req, res) => {
    try {
        const snapshot = await systemHealth.getHealthSnapshot();
        res.json(snapshot);
    } catch (e) {
        // Never let health endpoint crash the process.
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'HEXAD API',
            dbConnection: false,
            lastWriteTestTimestamp: null,
            activeStreamsCount: 0
        });
    }
});

module.exports = router;
