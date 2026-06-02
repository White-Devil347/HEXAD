const { body } = require('express-validator');

const normalizeVersion = (raw) => {
    if (!raw) return 'v1';
    const v = String(raw).trim().toLowerCase();
    if (v.startsWith('v')) return v;
    if (/^\d+$/.test(v)) return `v${v}`;
    return 'v1';
};

// NOTE: This config is the single source of truth for BOTH:
// 1) request validation rules (express-validator chains)
// 2) machine-readable schema returned by /api/schema/**
// Keeping them together ensures schema always matches validation.

const attendance = {
    version: 'v1',
    name: 'attendance',
    endpoint: '/student/submit-attendance',
    method: 'POST',
    description: 'Submit student attendance (by session code). Optionally supports trusted submission by sessionId when an internal key header is configured.',
    headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer <firebase_id_token>'
    },
    auth: {
        required: true,
        type: 'bearer',
        // This route is protected by verifyToken + requireStudent middleware.
        roles: ['student']
    },
    fields: {
        code: {
            type: 'string',
            required: false,
            description: 'Session code (aliases accepted: sessionCode, session_code). Required unless using trusted sessionId flow.',
            minLength: 3
        },
        sessionId: {
            type: 'string',
            required: false,
            description: 'Session id (aliases accepted: session_id). Allowed only for trusted callers when X-Hexad-Internal-Key is valid.'
        },
        session_id: {
            type: 'string',
            required: false,
            description: 'Session id (alias: sessionId). Allowed only for trusted callers when X-Hexad-Internal-Key is valid.'
        },

        // Optional compatibility fields (must match authenticated user context)
        studentId: { type: 'string', required: false, description: 'Must match the authenticated student uid (alias: student_id).' },
        student_id: { type: 'string', required: false, description: 'Must match the authenticated student uid (alias: studentId).' },
        collegeId: { type: 'string', required: false, description: 'Must match the authenticated user collegeId (alias: college_id).' },
        college_id: { type: 'string', required: false, description: 'Must match the authenticated user collegeId (alias: collegeId).' },
        timestamp: { type: 'string', required: false, description: 'Client timestamp (ISO string or ms). Server uses its own time for decisions.' },
        wifiSsid: { type: 'string', required: false, description: 'WiFi SSID (alias: wifi_ssid).' },
        wifi_ssid: { type: 'string', required: false, description: 'WiFi SSID (alias: wifiSsid).' },
        photoUrl: { type: 'string', required: false, description: 'Photo URL (alias: photo_url).' },
        photo_url: { type: 'string', required: false, description: 'Photo URL (alias: photoUrl).' },
        deviceId: { type: 'string', required: false, description: 'Device identifier (alias: device_id).' },
        device_id: { type: 'string', required: false, description: 'Device identifier (alias: deviceId).' },

        latitude: { type: 'number', required: false, description: 'Latitude (-90..90).', min: -90, max: 90 },
        longitude: { type: 'number', required: false, description: 'Longitude (-180..180).', min: -180, max: 180 },
        accuracyMeters: { type: 'number', required: false, description: 'Location accuracy in meters (0..10000).', min: 0, max: 10000 },

        'location.latitude': { type: 'number', required: false, description: 'Latitude (-90..90).', min: -90, max: 90 },
        'location.longitude': { type: 'number', required: false, description: 'Longitude (-180..180).', min: -180, max: 180 },
        'location.accuracyMeters': { type: 'number', required: false, description: 'Accuracy in meters (0..10000).', min: 0, max: 10000 }
    },
    validators: [
        body().custom((payload, { req }) => {
            const b = payload || {};
            const code = b.code || b.sessionCode || b.session_code;
            const sessionId = b.sessionId || b.session_id;
            const hasCode = Boolean(code && String(code).trim().length >= 3);
            const hasSessionId = Boolean(sessionId && String(sessionId).trim().length >= 8);

            if (hasCode) return true;

            if (hasSessionId) {
                const required = process.env.INTERNAL_ATTENDANCE_BYPASS_KEY || null;
                const provided = (req?.get && (req.get('x-hexad-internal-key') || req.get('x-internal-key'))) || null;
                if (!required) {
                    throw new Error('sessionId is not allowed (internal bypass is disabled)');
                }
                if (!provided || String(provided) !== String(required)) {
                    throw new Error('sessionId is not allowed (missing or invalid internal key)');
                }
                return true;
            }

            throw new Error('code or sessionId is required');
        }),
        body('sessionId').optional({ checkFalsy: true }).isUUID(),
        body('session_id').optional({ checkFalsy: true }).isUUID(),

        body('studentId').optional({ checkFalsy: true }).isString(),
        body('student_id').optional({ checkFalsy: true }).isString(),
        body('collegeId').optional({ checkFalsy: true }).isString(),
        body('college_id').optional({ checkFalsy: true }).isString(),
        body('timestamp').optional({ checkFalsy: true }),
        body('wifiSsid').optional({ checkFalsy: true }).isString(),
        body('wifi_ssid').optional({ checkFalsy: true }).isString(),
        body('photoUrl').optional({ checkFalsy: true }).isString(),
        body('photo_url').optional({ checkFalsy: true }).isString(),
        body('deviceId').optional({ checkFalsy: true }).isString(),
        body('device_id').optional({ checkFalsy: true }).isString(),
        body('latitude').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }),
        body('longitude').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }),
        body('accuracyMeters').optional({ checkFalsy: true }).isFloat({ min: 0, max: 10000 }),
        body('location.latitude').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }),
        body('location.longitude').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }),
        body('location.accuracyMeters').optional({ checkFalsy: true }).isFloat({ min: 0, max: 10000 })
    ]
};

const SCHEMAS = {
    v1: {
        attendance
    }
};

const getSchema = (version, name) => {
    const v = normalizeVersion(version);
    const schemaSet = SCHEMAS[v];
    if (!schemaSet) return null;
    const key = String(name || '').trim().toLowerCase();
    return schemaSet[key] || null;
};

const getSchemaResponse = (version, name) => {
    const schema = getSchema(version, name);
    if (!schema) return null;

    // Never expose validators; only public schema metadata.
    return {
        endpoint: schema.endpoint,
        method: schema.method,
        description: schema.description,
        fields: schema.fields,
        headers: schema.headers,
        auth: schema.auth,
        version: schema.version
    };
};

const getValidators = (version, name) => {
    const schema = getSchema(version, name);
    if (!schema) return null;
    return schema.validators;
};

module.exports = {
    getSchemaResponse,
    getValidators
};
