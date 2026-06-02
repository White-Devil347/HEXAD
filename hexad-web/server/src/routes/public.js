const express = require('express');
const router = express.Router();
const { query } = require('express-validator');

const publicController = require('../controllers/publicController');
const { validate } = require('../middleware/validate');

// Public session discovery (no auth): GET /api/public/sessions?collegeId=<id>
router.get('/sessions', [
    query('collegeId').optional({ checkFalsy: true }).isString().isLength({ min: 1, max: 128 }),
    query('college_id').optional({ checkFalsy: true }).isString().isLength({ min: 1, max: 128 }),
    query().custom((_, { req }) => {
        const collegeId = req.query?.collegeId || req.query?.college_id;
        if (!collegeId || String(collegeId).trim().length === 0) {
            throw new Error('collegeId is required');
        }
        return true;
    })
], validate, publicController.getActiveSessions);

module.exports = router;
