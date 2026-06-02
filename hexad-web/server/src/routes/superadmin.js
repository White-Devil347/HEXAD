const express = require('express');
const router = express.Router();

const superadminController = require('../controllers/superadminController');
const { verifyToken, requireSuperAdmin } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');

// Require auth + superadmin UID membership for all superadmin endpoints
router.use(auditMiddleware);
router.use(verifyToken);
router.use(requireSuperAdmin);

router.get('/colleges', superadminController.getColleges);
router.post('/colleges', superadminController.createCollege);
router.post('/admins', superadminController.createCollegeAdmin);
router.patch('/colleges/:collegeId/status', superadminController.setCollegeStatus);

module.exports = router;
