const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const adminController = require('../controllers/adminController');
const userController = require('../controllers/userController');
const configController = require('../controllers/configController');
const monitoringController = require('../controllers/monitoringController');
const importController = require('../controllers/importController');
const { verifyToken, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditMiddleware } = require('../middleware/audit');

// Apply middleware
router.use(verifyToken);
router.use(requireAdmin);
router.use(auditMiddleware);

// ==================== DASHBOARD ====================

router.get('/dashboard', monitoringController.getDashboardStats);

// ==================== COLLEGES (Super Admin Only) ====================

router.get('/colleges', requireSuperAdmin, [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString()
], validate, adminController.getColleges);

router.post('/colleges', requireSuperAdmin, [
    body('name').notEmpty().withMessage('Name required'),
    body('code').notEmpty().isLength({ min: 2, max: 50 }).withMessage('Code required (2-50 chars)'),
    body('address').optional().isString(),
    body('contactEmail').optional().isEmail(),
    body('contactPhone').optional().isString()
], validate, adminController.createCollege);

router.put('/colleges/:collegeId', requireSuperAdmin, [
    param('collegeId').isString().notEmpty(),
    body('name').optional().notEmpty(),
    body('code').optional().isLength({ min: 2, max: 50 }),
    body('isActive').optional().isBoolean()
], validate, adminController.updateCollege);

// ==================== DEPARTMENTS ====================

router.get('/departments', [
    query('collegeId').optional().isString(),
    query('page').optional().toInt().isInt({ min: 1 }),
    query('limit').optional().toInt().isInt({ min: 1, max: 200 })
], validate, adminController.getDepartments);

router.post('/departments', [
    body('collegeId').optional().isString(),
    body('name').notEmpty().withMessage('Name required'),
    body('code').notEmpty().isLength({ min: 2, max: 50 }).withMessage('Code required'),
    body('yearsCount').optional().toInt().isInt({ min: 1, max: 20 }).withMessage('Years count must be an integer (1-20)')
], validate, adminController.createDepartment);

router.put('/departments/:departmentId', [
    param('departmentId').isUUID(),
    body('name').optional().notEmpty(),
    body('code').optional().isLength({ min: 2, max: 50 }),
    body('isActive').optional().isBoolean(),
    body('yearsCount').optional().toInt().isInt({ min: 1, max: 20 }).withMessage('Years count must be an integer (1-20)')
], validate, adminController.updateDepartment);

// ==================== CLASSES ====================

router.get('/classes', [
    query('collegeId').optional().isString(),
    query('departmentId').optional().isUUID(),
    query('page').optional().toInt().isInt({ min: 1 }),
    query('limit').optional().toInt().isInt({ min: 1, max: 200 })
], validate, adminController.getClasses);

router.post('/classes', [
    body('departmentId').isUUID().withMessage('Department ID required'),
    body('name').notEmpty().withMessage('Name required'),
    body('code').notEmpty().isLength({ min: 2, max: 50 }).withMessage('Code required'),
    body('academicYear').optional().isString(),
    body('semester').optional().isInt({ min: 1, max: 12 })
], validate, adminController.createClass);

router.put('/classes/:classId', [
    param('classId').isUUID(),
    body('name').optional().notEmpty(),
    body('code').optional().isLength({ min: 2, max: 50 }),
    body('academicYear').optional().isString(),
    body('semester').optional().isInt({ min: 1, max: 12 }),
    body('isActive').optional().isBoolean()
], validate, adminController.updateClass);

// ==================== SUBJECTS ====================

router.get('/subjects', [
    query('departmentId').optional().isUUID(),
    query('page').optional().toInt().isInt({ min: 1 }),
    query('limit').optional().toInt().isInt({ min: 1, max: 200 })
], validate, adminController.getSubjects);

router.post('/subjects', [
    body('departmentId').isUUID().withMessage('Department ID required'),
    body('name').notEmpty().withMessage('Name required'),
    body('code').notEmpty().isLength({ min: 2, max: 50 }).withMessage('Code required'),
    body('credits').optional().isInt({ min: 0, max: 20 })
], validate, adminController.createSubject);

router.post('/subjects/assign-class', [
    body('classId').isUUID().withMessage('Class ID required'),
    body('subjectId').isUUID().withMessage('Subject ID required')
], validate, adminController.assignSubjectToClass);

// ==================== USERS ====================

// Import users (JSON/CSV upload)
router.post('/import-users', importController.importUsersUploadMiddleware, importController.importUsers);

router.get('/users', [
    query('role').optional().isIn(['teacher', 'student', 'admin']),
    query('collegeId').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString()
], validate, userController.getUsers);

router.get('/users/:userId', [
    param('userId').isString().notEmpty()
], validate, userController.getUserById);

// Bulk user fetch (remove N+1 hydration)
router.post('/users/bulk', [
    body().custom((payload) => {
        const uids = Array.isArray(payload) ? payload : payload?.uids;
        if (!Array.isArray(uids) || uids.length === 0) {
            throw new Error('Request body must be an array of user IDs (or { uids: [...] })');
        }
        return true;
    })
], validate, userController.getUsersBulk);

// Create teacher
router.post('/users/teachers', [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').notEmpty().withMessage('First name required'),
    body('lastName').optional().isString(),
    body('phone').optional().isString(),
    body('collegeId').optional().isString()
], validate, userController.createTeacher);

// Bulk import teachers
router.post('/users/teachers/bulk', [
    body('teachers').isArray({ min: 1 }).withMessage('Teachers array required'),
    body('teachers.*.email').isEmail().withMessage('Valid email required'),
    body('teachers.*.firstName').notEmpty().withMessage('First name required'),
    body('teachers.*.lastName').notEmpty().withMessage('Last name required'),
    body('teachers.*.password').optional().isString(),
    body('teachers.*.phone').optional().isString(),
    body('teachers.*.teacherId').optional().isString(),
    body('collegeId').optional().isString()
], validate, userController.bulkImportTeachers);

// Create student
router.post('/users/students', [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').notEmpty().withMessage('First name required'),
    body('lastName').optional().isString(),
    body('phone').optional().isString(),
    body('collegeId').optional().isString(),
    body('departmentId').isUUID().withMessage('Department ID required'),
    body('classId').isUUID().withMessage('Class ID required'),
    body('rollNumber').optional().isString(),
    body('enrollmentYear').optional().isInt()
], validate, userController.createStudent);

// Bulk import students
router.post('/users/students/bulk', [
    body('students').isArray({ min: 1 }).withMessage('Students array required'),
    body('students.*.email').isEmail().withMessage('Valid email required'),
    body('students.*.firstName').notEmpty().withMessage('First name required'),
    body('students.*.lastName').notEmpty().withMessage('Last name required'),
    body('students.*.departmentId').isUUID().withMessage('Department ID required'),
    body('students.*.classId').isUUID().withMessage('Class ID required'),
    body('students.*.rollNumber').optional().isString(),
    body('students.*.password').optional().isString(),
    body('students.*.phone').optional().isString(),
    body('students.*.enrollmentYear').optional().isInt(),
    body('students.*.studentId').optional().isString()
], validate, userController.bulkImportStudents);

// Update user
router.put('/users/:userId', [
    param('userId').isString().notEmpty(),
    body('firstName').optional().notEmpty(),
    body('lastName').optional().isString(),
    body('phone').optional().isString(),
    body('isActive').optional().isBoolean(),
    body('classId').optional().isUUID(),
    body('rollNumber').optional().isString()
], validate, userController.updateUser);

// Reset user password
router.post('/users/:userId/reset-password', [
    param('userId').isString().notEmpty(),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], validate, userController.resetUserPassword);

// ==================== TEACHER ASSIGNMENTS ====================

router.get('/teachers/:teacherId/assignments', [
    param('teacherId').isString().notEmpty()
], validate, userController.getTeacherAssignments);

router.post('/teachers/assignments', [
    body('teacherId').isString().notEmpty().withMessage('Teacher ID required'),
    body('classId').isUUID().withMessage('Class ID required'),
    body('subjectId').isUUID().withMessage('Subject ID required'),
    body('academicYear').optional().isString()
], validate, userController.assignTeacher);

router.delete('/teachers/assignments/:assignmentId', [
    param('assignmentId').isUUID()
], validate, userController.removeTeacherAssignment);

// ==================== CONFIGURATION ====================

router.get('/config', configController.getConfig);

router.put('/config', [
    body('configs').isArray({ min: 1 }),
    body('configs.*.key').notEmpty(),
    body('configs.*.value').notEmpty()
], validate, configController.updateConfig);

// Geofences
router.get('/geofences', configController.getGeofences);

router.post('/geofences', [
    body('name').notEmpty().withMessage('Name required'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
    body('radiusMeters').optional().isInt({ min: 10, max: 5000 }),
    body('collegeId').optional().isString()
], validate, configController.createGeofence);

router.put('/geofences/:geofenceId', [
    param('geofenceId').isUUID(),
    body('name').optional().notEmpty(),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('radiusMeters').optional().isInt({ min: 10, max: 5000 }),
    body('isActive').optional().isBoolean()
], validate, configController.updateGeofence);

router.delete('/geofences/:geofenceId', [
    param('geofenceId').isUUID()
], validate, configController.deleteGeofence);

// WiFi Networks
router.get('/wifi-networks', configController.getWifiNetworks);

router.post('/wifi-networks', [
    body('ssid').notEmpty().withMessage('SSID required'),
    body('description').optional().isString(),
    body('collegeId').optional().isString()
], validate, configController.createWifiNetwork);

router.delete('/wifi-networks/:networkId', [
    param('networkId').isUUID()
], validate, configController.deleteWifiNetwork);

// Retention Policies
router.get('/retention-policies', configController.getRetentionPolicies);

router.put('/retention-policies', [
    body('dataType').notEmpty(),
    body('retentionDays').isInt({ min: 1 }),
    body('autoArchive').optional().isBoolean(),
    body('autoDelete').optional().isBoolean()
], validate, configController.updateRetentionPolicy);

// ==================== MONITORING ====================

// System health stream (SSE)
router.get('/health/stream', monitoringController.streamHealth);

router.get('/audit-logs', [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('fast').optional().isIn(['true', 'false']),
    query('userId').optional().isString(),
    query('action').optional().isString(),
    query('entityType').optional().isString(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601()
], validate, monitoringController.getAuditLogs);

router.get('/sync-logs', [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('studentId').optional().isString(),
    query('status').optional().isIn(['success', 'partial', 'failed']),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601()
], validate, monitoringController.getSyncLogs);

router.get('/suspicious-activities', [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    query('resolved').optional().isIn(['true', 'false']),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601()
], validate, monitoringController.getSuspiciousActivities);

router.post('/suspicious-activities/:activityId/resolve', [
    param('activityId').isUUID(),
    body('resolutionNotes').optional().isString().isLength({ max: 1000 })
], validate, monitoringController.resolveSuspiciousActivity);

router.get('/storage-health', monitoringController.getStorageHealth);

module.exports = router;
