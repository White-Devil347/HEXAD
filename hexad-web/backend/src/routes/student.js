const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const studentController = require('../controllers/studentController');
const { verifyToken, requireStudent } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditMiddleware } = require('../middleware/audit');
const { getValidators } = require('../config/schema');
const config = require('../config');

const getInternalKey = (req) => {
    if (!req || typeof req.get !== 'function') return null;
    return req.get('x-hexad-internal-key') || req.get('x-internal-key') || null;
};

const internalOrStudentAuth = (req, res, next) => {
    const required = config?.internal?.attendanceBypassKey;
    const provided = getInternalKey(req);

    if (required && provided && String(provided) === String(required)) {
        const body = req.body || {};
        const collegeId = body.collegeId || body.college_id;
        const studentId = body.studentId || body.student_id;

        if (!collegeId) {
            return res.status(400).json({ success: false, message: 'collegeId is required' });
        }
        if (!studentId) {
            return res.status(400).json({ success: false, message: 'studentId is required' });
        }

        // Minimal internal user context for auditing + controller logic.
        req.user = {
            uid: String(studentId),
            id: String(studentId),
            role: 'internal',
            profileRole: 'internal',
            isSuperAdmin: false,
            email: null,
            firstName: null,
            lastName: null,
            collegeId: String(collegeId)
        };

        return next();
    }

    // Default production behavior: Firebase auth + strict student role.
    return verifyToken(req, res, () => requireStudent(req, res, next));
};

// Student-only endpoints (default production behavior)
router.post('/validate-code', [
    verifyToken,
    requireStudent,
    auditMiddleware,
    body().custom((payload) => {
        const b = payload || {};
        const code = b.code || b.sessionCode || b.session_code;
        if (!code || String(code).trim().length < 3) {
            throw new Error('Valid code is required');
        }
        return true;
    })
], validate, studentController.validateCode);

// Attendance submission supports trusted internal mode (internal key) OR normal student mode.
router.post('/submit-attendance', [
    internalOrStudentAuth,
    auditMiddleware,
    ...(getValidators('v1', 'attendance') || [])
], validate, studentController.submitAttendance);

module.exports = router;
