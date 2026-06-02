const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body, param, query } = require('express-validator');
const teacherController = require('../controllers/teacherController');
const analyticsController = require('../controllers/analyticsController');
const reportController = require('../controllers/reportController');
const { verifyToken, requireTeacher } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditMiddleware } = require('../middleware/audit');
const config = require('../config');

const getInternalKey = (req) => {
    if (!req || typeof req.get !== 'function') return null;
    return req.get('x-hexad-internal-key') || req.get('x-internal-key') || null;
};

const requireTrustedInternalKey = (req, res, next) => {
    const required = config?.internal?.attendanceBypassKey;
    if (!required) {
        return res.status(403).json({
            success: false,
            message: 'Trusted internal access is not enabled'
        });
    }

    const provided = getInternalKey(req);
    if (!provided || String(provided) !== String(required)) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }

    const collegeId = String(req.query?.collegeId || '').trim();
    req.user = {
        uid: 'internal-simulator',
        id: 'internal-simulator',
        role: 'internal',
        profileRole: 'internal',
        isSuperAdmin: false,
        email: null,
        firstName: null,
        lastName: null,
        collegeId: collegeId || null
    };

    return next();
};

const internalRosterLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: config.nodeEnv === 'development' ? 240 : 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests, please try again later.'
    }
});

router.get('/sessions/:sessionId/enrolled-students', [
    internalRosterLimiter,
    requireTrustedInternalKey,
    param('sessionId').isUUID(),
    query('collegeId').isString().trim().notEmpty().isLength({ min: 2, max: 120 })
], validate, teacherController.getSessionEnrolledStudentsInternal);

// Apply middleware
router.use(verifyToken);
router.use(requireTeacher);
router.use(auditMiddleware);

// ==================== ASSIGNMENTS ====================
router.get('/assignments', teacherController.getAssignments);

// ==================== DASHBOARD ====================

// Realtime dashboard snapshot stream (SSE)
router.get('/dashboard/stream', teacherController.streamDashboard);

// ==================== SESSIONS ====================

// Get all sessions
router.get('/sessions', [
    query('page').optional({ checkFalsy: true }).isInt({ min: 1 }),
    query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }),
    query('status').optional({ checkFalsy: true }).isIn(['scheduled', 'active', 'completed', 'ended', 'cancelled']),
    query('classId').optional({ checkFalsy: true }).isUUID(),
    query('subjectId').optional({ checkFalsy: true }).isUUID(),
    query('class_id').optional({ checkFalsy: true }).isUUID(),
    query('subject_id').optional({ checkFalsy: true }).isUUID(),
    query('dateFrom').optional({ checkFalsy: true }).isDate(),
    query('dateTo').optional({ checkFalsy: true }).isDate(),
    query('start_date').optional({ checkFalsy: true }).isDate(),
    query('end_date').optional({ checkFalsy: true }).isDate()
], validate, teacherController.getSessions);

// Get single session with attendance
router.get('/sessions/:sessionId', [
    query('includeAttendance').optional({ checkFalsy: true }).isIn(['true', 'false']),
    query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 500 }),
    query('pageSize').optional({ checkFalsy: true }).isInt({ min: 1, max: 500 }),
    query('cursor').optional({ checkFalsy: true }).isString().isLength({ min: 1, max: 128 }),
    query('startAfter').optional({ checkFalsy: true }).isString().isLength({ min: 1, max: 128 }),
    param('sessionId').isUUID()
], validate, teacherController.getSession);

// Realtime stats stream (SSE)
router.get('/sessions/:sessionId/stream', [
    param('sessionId').isUUID()
], validate, teacherController.streamSessionStats);

// Create session
router.post('/sessions', [
    body().custom((payload) => {
        const b = payload || {};
        const hasAssignment = Boolean(b.assignmentId || b.assignment_id);
        const hasPair = Boolean((b.classId || b.class_id) && (b.subjectId || b.subject_id));
        if (!hasAssignment && !hasPair) {
            throw new Error('assignment_id or (classId+subjectId) is required');
        }
        return true;
    }),
    body('assignmentId').optional({ checkFalsy: true }).isUUID(),
    body('assignment_id').optional({ checkFalsy: true }).isUUID(),
    body('classId').optional({ checkFalsy: true }).isUUID(),
    body('subjectId').optional({ checkFalsy: true }).isUUID(),
    body('class_id').optional({ checkFalsy: true }).isUUID(),
    body('subject_id').optional({ checkFalsy: true }).isUUID(),
    body('sessionDate').optional({ checkFalsy: true }).isDate(),
    body('session_date').optional({ checkFalsy: true }).isDate(),
    body('startTime').optional({ checkFalsy: true }).matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('start_time').optional({ checkFalsy: true }).matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('endTime').optional({ checkFalsy: true }).matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('end_time').optional({ checkFalsy: true }).matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('geoLatitude').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }),
    body('geoLongitude').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }),
    body('geoRadius').optional({ checkFalsy: true }).isInt({ min: 10, max: 1000 }),
    body('geofence_radius_meters').optional({ checkFalsy: true }).isInt({ min: 10, max: 1000 }),
    body('late_threshold_minutes').optional({ checkFalsy: true }).isInt({ min: 0, max: 180 }),
    body('duration_minutes').optional({ checkFalsy: true }).isInt({ min: 0, max: 600 }),
    body('require_photo').optional({ checkFalsy: true }).isBoolean(),
    body('require_location').optional({ checkFalsy: true }).isBoolean(),
    body('require_wifi').optional({ checkFalsy: true }).isBoolean()
], validate, teacherController.createSession);

// Regenerate session code
router.post('/sessions/:sessionId/regenerate-code', [
    param('sessionId').isUUID()
], validate, teacherController.regenerateCode);

// Start session
router.post('/sessions/:sessionId/start', [
    param('sessionId').isUUID()
], validate, teacherController.startSession);

// End session
router.post('/sessions/:sessionId/end', [
    param('sessionId').isUUID()
], validate, teacherController.endSession);

// Manual attendance override
router.post('/sessions/:sessionId/override', [
    param('sessionId').isUUID(),
    body().custom((payload) => {
        const b = payload || {};
        if (!b.studentId && !b.student_id) {
            throw new Error('Valid studentId required');
        }
        return true;
    }),
    body('studentId').optional().isString().notEmpty(),
    body('student_id').optional().isString().notEmpty(),
    body('status').isIn(['present', 'absent', 'late', 'excused']),
    body('reason').optional().isString().isLength({ max: 500 })
], validate, teacherController.overrideAttendance);

// Get attendance attempts (photo audit)
router.get('/sessions/:sessionId/attempts/:studentId', [
    param('sessionId').isUUID(),
    param('studentId').isString().notEmpty()
], validate, teacherController.getAttendanceAttempts);

// Get flagged students
router.get('/sessions/:sessionId/flagged', [
    param('sessionId').isUUID()
], validate, teacherController.getFlaggedStudents);

// ==================== SECURITY (V2) ====================

router.get('/security/summary', teacherController.getSecuritySummary);
router.get('/security/list', [
    query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 200 }),
    query('cursor').optional({ checkFalsy: true }).isString().isLength({ min: 1, max: 128 }),
    query('severity').optional({ checkFalsy: true }).isIn(['LOW', 'MEDIUM', 'HIGH']),
    query('resolved').optional({ checkFalsy: true }).isIn(['true', 'false'])
], validate, teacherController.getSecurityList);

// ==================== ANALYTICS ====================

// Get attendance analytics
router.get('/analytics', [
    query('period').optional({ checkFalsy: true }).isIn(['today', 'week', 'month', 'semester', 'year']),
    query('classId').optional({ checkFalsy: true }).isUUID(),
    query('subjectId').optional({ checkFalsy: true }).isUUID(),
    query('class_id').optional({ checkFalsy: true }).isUUID(),
    query('subject_id').optional({ checkFalsy: true }).isUUID()
], validate, analyticsController.getAttendanceAnalytics);

// Get student analytics
router.get('/analytics/students', [
    query('period').optional({ checkFalsy: true }).isIn(['today', 'week', 'month', 'semester', 'year']),
    query('classId').optional({ checkFalsy: true }).isUUID(),
    query('subjectId').optional({ checkFalsy: true }).isUUID(),
    query('class_id').optional({ checkFalsy: true }).isUUID(),
    query('subject_id').optional({ checkFalsy: true }).isUUID()
], validate, analyticsController.getStudentAnalytics);

// Get AI insights
router.get('/analytics/insights', [
    query('period').optional({ checkFalsy: true }).isIn(['today', 'week', 'month', 'semester', 'year']),
    query('classId').optional({ checkFalsy: true }).isUUID(),
    query('class_id').optional({ checkFalsy: true }).isUUID()
], validate, analyticsController.getInsights);

// Alias: Get AI insights (separate endpoint)
router.get('/insights', [
    query('period').optional({ checkFalsy: true }).isIn(['today', 'week', 'month', 'semester', 'year']),
    query('classId').optional({ checkFalsy: true }).isUUID(),
    query('class_id').optional({ checkFalsy: true }).isUUID()
], validate, analyticsController.getInsights);

// Get heatmap data
router.get('/analytics/heatmap', [
    query('period').optional({ checkFalsy: true }).isIn(['today', 'week', 'month', 'semester', 'year']),
    query('classId').optional({ checkFalsy: true }).isUUID(),
    query('class_id').optional({ checkFalsy: true }).isUUID()
], validate, analyticsController.getHeatmapData);

// ==================== REPORTS ====================

// Export to Excel
router.get('/reports/export/excel', [
    query('sessionId').optional({ checkFalsy: true }).isUUID(),
    query('classId').optional({ checkFalsy: true }).isUUID(),
    query('subjectId').optional({ checkFalsy: true }).isUUID(),
    query('dateFrom').optional({ checkFalsy: true }).isDate(),
    query('dateTo').optional({ checkFalsy: true }).isDate(),
    query('class_id').optional({ checkFalsy: true }).isUUID(),
    query('subject_id').optional({ checkFalsy: true }).isUUID(),
    query('start_date').optional({ checkFalsy: true }).isDate(),
    query('end_date').optional({ checkFalsy: true }).isDate()
], validate, reportController.exportToExcel);

// Export to PDF
router.get('/reports/export/pdf', [
    query('sessionId').optional({ checkFalsy: true }).isUUID(),
    query('classId').optional({ checkFalsy: true }).isUUID(),
    query('subjectId').optional({ checkFalsy: true }).isUUID(),
    query('dateFrom').optional({ checkFalsy: true }).isDate(),
    query('dateTo').optional({ checkFalsy: true }).isDate(),
    query('class_id').optional({ checkFalsy: true }).isUUID(),
    query('subject_id').optional({ checkFalsy: true }).isUUID(),
    query('start_date').optional({ checkFalsy: true }).isDate(),
    query('end_date').optional({ checkFalsy: true }).isDate()
], validate, reportController.exportToPDF);

// Generate monthly report
router.get('/reports/monthly', [
    query('month').optional({ checkFalsy: true }).isInt({ min: 1, max: 12 }),
    query('year').optional({ checkFalsy: true }).isInt({ min: 2020, max: 2100 }),
    query('classId').optional({ checkFalsy: true }).isUUID(),
    query('class_id').optional({ checkFalsy: true }).isUUID()
], validate, reportController.generateMonthlyReport);

module.exports = router;
