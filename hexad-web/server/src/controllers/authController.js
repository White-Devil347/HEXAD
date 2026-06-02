const { rtdb } = require('../firebase/firebase');
const { response } = require('../utils');

// Get current user profile (Firebase RTDB)
exports.getProfile = async (req, res) => {
    try {
        const snap = await rtdb().ref(`users/${req.user.uid}`).once('value');
        const profile = snap.val();

        if (!profile) {
            return response.notFound(res, 'User not found');
        }

        return response.success(res, {
            uid: req.user.uid,
            ...profile
        });
    } catch (error) {
        console.error('Get profile error:', error);
        return response.serverError(res, 'Failed to fetch profile');
    }
};

// Get auth context for current user (role + college + superadmin)
exports.getMe = async (req, res) => {
    try {
        // role: the user's profile role (admin/teacher/student/user)
        // isSuperAdmin: asserted only via /superadmins/{uid}
        return res.status(200).json({
            uid: req.user.uid,
            role: req.user.profileRole || req.user.role || 'user',
            collegeId: req.user.collegeId || null,
            isSuperAdmin: req.user.isSuperAdmin === true
        });
    } catch (error) {
        console.error('Get me error:', error);
        return res.status(500).json({ message: 'Failed to fetch auth context' });
    }
};

// Record a logout event for audit/suspicion analytics
exports.logout = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const payload = {
            // Keep both formats: suspicion scorer expects timestamp_ms; UI/debugging may prefer at_ms.
            timestamp_ms: nowMs,
            timestamp: nowIso,
            at_ms: nowMs,
            at: nowIso,
            uid: req.user.uid,
            reason: req.body?.reason || null,
            deviceId: req.body?.deviceId || null,
            clientTimestampMs: req.body?.clientTimestampMs || null,
            ip: req.ip || null,
            userAgent: req.get('user-agent') || null
        };

        const ref = rtdb().ref(`colleges/${collegeId}/security/logout_logs/${req.user.uid}`).push();
        await ref.set(payload);

        await req.audit('LOGOUT', 'auth', ref.key);
        return response.success(res, { id: ref.key }, 'Logout recorded');
    } catch (error) {
        console.error('Logout error:', error);
        return response.serverError(res, 'Failed to record logout');
    }
};
