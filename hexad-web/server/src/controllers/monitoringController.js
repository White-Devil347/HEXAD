const { rtdb } = require('../firebase/firebase');
const { response } = require('../utils');
const systemHealth = require('../utils/systemHealth');
const streamRegistry = require('../utils/streamRegistry');

const PATHS = {
    auditEvents: (collegeId) => `colleges/${collegeId}/audit_logs/events`,
    syncLogs: (collegeId) => `colleges/${collegeId}/sync_logs`,
    suspiciousActivities: (collegeId) => `colleges/${collegeId}/suspicious_activities`,
    collegeUsers: (collegeId) => `colleges/${collegeId}/users`,
    classes: (collegeId) => `colleges/${collegeId}/classes`,
    departments: (collegeId) => `colleges/${collegeId}/departments`,
    subjects: (collegeId) => `colleges/${collegeId}/subjects`,
    attendanceSessions: (collegeId) => `colleges/${collegeId}/sessions`
};

const readVal = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.val();
};

const buildProfileName = (profile) => {
    const firstName = profile?.firstName || profile?.first_name || null;
    const lastName = profile?.lastName || profile?.last_name || null;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (fullName) return fullName;
    return profile?.email || null;
};

const enrichAuditItems = async (items) => {
    const needsEnrichment = (e) => Boolean(e?.user_id) && (!e.user_name || !e.user_role);
    const uids = Array.from(new Set((items || []).filter(needsEnrichment).map((e) => e.user_id).filter(Boolean)));
    if (uids.length === 0) return items;

    const profiles = await Promise.all(uids.map((uid) => readVal(`users/${uid}`)));
    const byUid = uids.reduce((acc, uid, idx) => {
        acc[uid] = profiles[idx] || null;
        return acc;
    }, {});

    return (items || []).map((e) => {
        if (!needsEnrichment(e)) return e;
        const p = byUid[e.user_id] || null;
        if (!p) return e;
        return {
            ...e,
            user_role: e.user_role || p.role || null,
            user_name: e.user_name || buildProfileName(p)
        };
    });
};

const paginateArray = (items, page, limit) => {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const offset = (p - 1) * l;
    return { page: p, limit: l, total: items.length, items: items.slice(offset, offset + l) };
};

const readRecentByCreatedAt = async (path, limit) => {
    const l = Math.max(1, Math.min(100, Number(limit) || 50));
    const snap = await rtdb().ref(path)
        .orderByChild('created_at_ms')
        .limitToLast(l)
        .once('value');
    return snap.val();
};

exports.getDashboardStats = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const [usersIdx, classes, departments, subjects, sessions] = await Promise.all([
            readVal(PATHS.collegeUsers(collegeId)),
            readVal(PATHS.classes(collegeId)),
            readVal(PATHS.departments(collegeId)),
            readVal(PATHS.subjects(collegeId)),
            readVal(PATHS.attendanceSessions(collegeId))
        ]);

        const userUids = Object.keys(usersIdx || {});
        const profiles = await Promise.all(userUids.map((uid) => readVal(`users/${uid}`)));
        const countsByRole = profiles.reduce((acc, p) => {
            const r = p?.role || 'unknown';
            acc[r] = (acc[r] || 0) + 1;
            return acc;
        }, {});

        const stats = {
            users: {
                total: userUids.length,
                teachers: countsByRole.teacher || 0,
                students: countsByRole.student || 0,
                admins: countsByRole.admin || 0
            },
            counts: {
                classes: Object.keys(classes || {}).length,
                departments: Object.keys(departments || {}).length,
                subjects: Object.keys(subjects || {}).length,
                sessions: Object.keys(sessions || {}).length
            }
        };

        return response.success(res, stats);
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        return response.serverError(res, 'Failed to fetch dashboard stats');
    }
};

exports.getAuditLogs = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { page = 1, limit = 50, fast = 'false', userId, action, entityType, dateFrom, dateTo } = req.query;
        const shouldUseFast = String(fast) === 'true'
            && String(page) === '1'
            && !userId
            && !action
            && !entityType
            && !dateFrom
            && !dateTo;

        const events = shouldUseFast
            ? (await readRecentByCreatedAt(PATHS.auditEvents(collegeId), limit))
            : (await readVal(PATHS.auditEvents(collegeId)));

        const eventsObj = events || {};
        let list = Object.entries(eventsObj)
            .map(([id, e]) => ({ id, ...e }))
            .filter(Boolean);

        if (userId) list = list.filter((e) => e.user_id === userId || e.user_uid === userId || e.userId === userId);
        if (action) list = list.filter((e) => String(e.action || '').toLowerCase().includes(String(action).toLowerCase()));
        if (entityType) list = list.filter((e) => String(e.entity_type || '').toLowerCase().includes(String(entityType).toLowerCase()));
        if (dateFrom) list = list.filter((e) => (e.created_at_ms || 0) >= new Date(dateFrom).getTime());
        if (dateTo) list = list.filter((e) => (e.created_at_ms || 0) <= new Date(dateTo).getTime());

        list.sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0));
        const paged = paginateArray(list, page, limit);
        const enrichedItems = await enrichAuditItems(paged.items);
        // In fast mode, we only read a limited slice of events; total becomes "slice size".
        return response.paginatedResponse(res, enrichedItems, paged.total, paged.page, paged.limit);
    } catch (error) {
        console.error('Get audit logs error:', error);
        return response.serverError(res, 'Failed to fetch audit logs');
    }
};

exports.getSyncLogs = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { page = 1, limit = 50, studentId, status, dateFrom, dateTo } = req.query;
        const logs = await readVal(PATHS.syncLogs(collegeId)) || {};
        let list = Object.entries(logs).map(([id, l]) => ({ id, ...l })).filter(Boolean);
        if (studentId) list = list.filter((l) => l.studentId === studentId);
        if (status) list = list.filter((l) => l.status === status);
        if (dateFrom) list = list.filter((l) => (l.created_at_ms || 0) >= new Date(dateFrom).getTime());
        if (dateTo) list = list.filter((l) => (l.created_at_ms || 0) <= new Date(dateTo).getTime());
        list.sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0));
        const paged = paginateArray(list, page, limit);
        return response.paginatedResponse(res, paged.items, paged.total, paged.page, paged.limit);
    } catch (error) {
        console.error('Get sync logs error:', error);
        return response.serverError(res, 'Failed to fetch sync logs');
    }
};

exports.getSuspiciousActivities = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { page = 1, limit = 50, severity, resolved, dateFrom, dateTo } = req.query;
        const acts = await readVal(PATHS.suspiciousActivities(collegeId)) || {};
        let list = Object.entries(acts).map(([id, a]) => ({ id, ...a })).filter(Boolean);
        if (severity) list = list.filter((a) => a.severity === severity);
        if (resolved === 'true') list = list.filter((a) => Boolean(a.resolved) === true);
        if (resolved === 'false') list = list.filter((a) => Boolean(a.resolved) === false);
        if (dateFrom) list = list.filter((a) => (a.created_at_ms || 0) >= new Date(dateFrom).getTime());
        if (dateTo) list = list.filter((a) => (a.created_at_ms || 0) <= new Date(dateTo).getTime());
        list.sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0));
        const paged = paginateArray(list, page, limit);
        return response.paginatedResponse(res, paged.items, paged.total, paged.page, paged.limit);
    } catch (error) {
        console.error('Get suspicious activities error:', error);
        return response.serverError(res, 'Failed to fetch suspicious activities');
    }
};

exports.resolveSuspiciousActivity = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { activityId } = req.params;
        const { resolutionNotes } = req.body;
        await rtdb().ref(`${PATHS.suspiciousActivities(collegeId)}/${activityId}`).update({
            resolved: true,
            resolutionNotes: resolutionNotes || null,
            resolved_at_ms: Date.now(),
            resolved_by: req.user.uid
        });
        await req.audit('RESOLVE_SUSPICIOUS_ACTIVITY', 'suspicious_activity', activityId);
        return response.success(res, null, 'Activity resolved');
    } catch (error) {
        console.error('Resolve suspicious activity error:', error);
        return response.serverError(res, 'Failed to resolve activity');
    }
};

exports.getStorageHealth = async (req, res) => {
    try {
        // Best-effort RTDB connectivity check
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);
        await rtdb().ref(`colleges/${collegeId}/health_checks`).set({ checked_at_ms: Date.now() });
        return response.success(res, { status: 'ok' });
    } catch (error) {
        console.error('Storage health error:', error);
        return response.serverError(res, 'Storage health check failed');
    }
};

exports.streamHealth = async (req, res) => {
    try {
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        streamRegistry.increment('admin-health');
        res.write('retry: 3000\n\n');

        let closed = false;
        const sendSnapshot = async () => {
            if (closed) return;
            const snapshot = await systemHealth.getHealthSnapshot();
            res.write(`event: health\n`);
            res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
        };

        await sendSnapshot();

        const interval = setInterval(() => {
            sendSnapshot().catch((e) => console.warn('Health SSE snapshot failed:', e));
        }, 10_000);

        const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 25_000);

        req.on('close', () => {
            closed = true;
            clearInterval(interval);
            clearInterval(keepAlive);
            streamRegistry.decrement('admin-health');
        });
    } catch (error) {
        console.error('Stream health error:', error);
        return response.serverError(res, 'Failed to open health stream');
    }
};
