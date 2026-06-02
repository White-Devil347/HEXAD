const { rtdb } = require('../firebase/firebase');
const { response } = require('../utils');

const normalizeSessionStatus = (raw) => {
    const s = String(raw || '').trim().toLowerCase();
    if (s === 'ended') return 'completed';
    return s;
};

exports.getActiveSessions = async (req, res) => {
    try {
        const collegeId = String(req.query?.collegeId || req.query?.college_id || '').trim();
        if (!collegeId) return response.error(res, 'collegeId is required', 400);

        const snap = await rtdb()
            .ref(`colleges/${collegeId}/sessions`)
            .orderByChild('status')
            .equalTo('active')
            .once('value');

        const sessionsMap = snap.val() || {};
        const data = Object.entries(sessionsMap)
            .map(([key, s]) => ({ key, session: s }))
            .filter(({ session }) => Boolean(session))
            .filter(({ session }) => normalizeSessionStatus(session.status) === 'active')
            .map(({ key, session }) => ({
                sessionId: session.id || key,
                subject: session.subject_name || null,
                className: session.class_name || null,
                status: 'active'
            }));

        return response.success(res, data);
    } catch (error) {
        console.error('Public get active sessions error:', error);
        return response.serverError(res, 'Failed to fetch sessions');
    }
};
