const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');

// Apply audit middleware to all routes
router.use(auditMiddleware);

// Get profile (requires Firebase Auth)
router.get('/profile', verifyToken, authController.getProfile);

// Get auth context (requires Firebase Auth)
router.get('/me', verifyToken, authController.getMe);

// Record logout event (requires Firebase Auth)
router.post('/logout', verifyToken, authController.logout);

module.exports = router;
