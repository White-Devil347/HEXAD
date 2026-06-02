const { v4: uuidv4 } = require('uuid');
const { rtdb } = require('../firebase/firebase');

const toNullable = (value) => (value === undefined ? null : value);

const buildUserName = (req) => {
    const firstName = req?.user?.firstName || null;
    const lastName = req?.user?.lastName || null;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (fullName) return fullName;
    return req?.user?.email || null;
};

// Log action to audit trail
const auditLog = async (userId, action, entityType, entityId, oldValue, newValue, req) => {
    try {
        const auditId = uuidv4();
        const collegeId = req?.user?.collegeId || null;
        if (!collegeId) {
            return;
        }

        await rtdb().ref(`colleges/${collegeId}/audit_logs/events/${auditId}`).set({
            id: auditId,
            user_id: toNullable(userId),
            user_role: toNullable(req?.user?.role || null),
            user_name: toNullable(buildUserName(req)),
            action: action || 'unknown',
            entity_type: toNullable(entityType),
            entity_id: toNullable(entityId),
            old_value: oldValue ?? null,
            new_value: newValue ?? null,
            ip_address: req?.ip || null,
            user_agent: req?.headers?.['user-agent'] || null,
            created_at_ms: Date.now()
        });
    } catch (error) {
        console.error('Audit log error:', error);
        // Don't throw - audit logging should not break main functionality
    }
};

// Middleware to attach audit logging function to request
const auditMiddleware = (req, res, next) => {
    req.audit = async (action, entityType, entityId, oldValue = null, newValue = null) => {
        await auditLog(req.user?.id ?? null, action, entityType, entityId, oldValue, newValue, req);
    };
    next();
};

module.exports = { auditLog, auditMiddleware };
