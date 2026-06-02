const { v4: uuidv4 } = require('uuid');
const { auth, rtdb } = require('../firebase/firebase');
const { response } = require('../utils');

const countKeys = (obj) => (obj && typeof obj === 'object' ? Object.keys(obj).length : 0);

const readVal = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.val();
};

exports.getColleges = async (req, res) => {
    try {
        const colleges = await readVal('colleges') || {};

        const items = Object.entries(colleges).map(([collegeId, node]) => {
            const info = node?.info || {};
            const name = info?.name || info?.collegeName || info?.college_name || collegeId;
            const isActive = info?.isActive !== false;

            const adminsCount = countKeys(node?.admins);
            const departmentsCount = countKeys(node?.departments);
            const sessionsCount = countKeys(node?.sessions);

            return {
                collegeId,
                name,
                isActive,
                adminsCount,
                departmentsCount,
                sessionsCount
            };
        });

        items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        return response.success(res, items);
    } catch (error) {
        console.error('Get colleges error:', error);
        return response.serverError(res, 'Failed to fetch colleges');
    }
};

exports.createCollege = async (req, res) => {
    try {
        const { name } = req.body || {};
        const trimmedName = String(name || '').trim();
        if (!trimmedName) return response.error(res, 'College name is required', 400);

        const collegeId = `college_${uuidv4()}`;
        const nowMs = Date.now();

        const updates = {};
        updates[`colleges/${collegeId}/info`] = {
            id: collegeId,
            name: trimmedName,
            isActive: true,
            created_at_ms: nowMs,
            created_at: new Date(nowMs).toISOString()
        };
        updates[`colleges/${collegeId}/admins`] = {};
        updates[`colleges/${collegeId}/departments`] = {};
        updates[`colleges/${collegeId}/teacher_assignments`] = {};
        updates[`colleges/${collegeId}/sessions`] = {};
        updates[`colleges/${collegeId}/attendance_records`] = {};
        updates[`colleges/${collegeId}/reports`] = {};

        await rtdb().ref().update(updates);
        await req.audit('CREATE_COLLEGE', 'college', collegeId, null, { name: trimmedName });

        return response.created(res, { collegeId, name: trimmedName, isActive: true });
    } catch (error) {
        console.error('Create college error:', error);
        return response.serverError(res, 'Failed to create college');
    }
};

exports.createCollegeAdmin = async (req, res) => {
    try {
        const { email, password, collegeId } = req.body || {};
        const e = String(email || '').trim();
        const p = String(password || '');
        const cId = String(collegeId || '').trim();

        if (!e) return response.error(res, 'Email is required', 400);
        if (!p || p.length < 6) return response.error(res, 'Password must be at least 6 characters', 400);
        if (!cId) return response.error(res, 'collegeId is required', 400);

        const collegeInfo = await readVal(`colleges/${cId}/info`);
        if (!collegeInfo) return response.notFound(res, 'College not found');

        const userRecord = await auth().createUser({ email: e, password: p });
        const uid = userRecord.uid;

        try {
            const nowMs = Date.now();

            const profile = {
                uid,
                email: e,
                role: 'admin',
                collegeId: cId,
                isActive: true,
                created_at_ms: nowMs,
                created_at: new Date(nowMs).toISOString()
            };

            const updates = {};
            updates[`users/${uid}`] = profile;
            updates[`colleges/${cId}/admins/${uid}`] = true;
            updates[`colleges/${cId}/users/${uid}`] = true;

            await rtdb().ref().update(updates);
            await req.audit('CREATE_COLLEGE_ADMIN', 'user', uid, null, { email: e, collegeId: cId });

            return response.created(res, { uid, email: e, role: 'admin', collegeId: cId, isActive: true });
        } catch (writeError) {
            // Roll back Auth user if DB writes fail
            try {
                await auth().deleteUser(uid);
            } catch (rollbackError) {
                console.error('Rollback deleteUser failed:', rollbackError);
            }

            console.error('Create college admin write error:', writeError);
            return response.serverError(res, 'Failed to create college admin');
        }
    } catch (error) {
        console.error('Create college admin error:', error);
        // firebase-admin errors: auth/email-already-exists, auth/invalid-password, etc.
        return response.serverError(res, 'Failed to create college admin');
    }
};

exports.setCollegeStatus = async (req, res) => {
    try {
        const { collegeId } = req.params;
        const { isActive } = req.body || {};

        const cId = String(collegeId || '').trim();
        if (!cId) return response.error(res, 'collegeId is required', 400);
        if (typeof isActive !== 'boolean') return response.error(res, 'isActive must be boolean', 400);

        const infoPath = `colleges/${cId}/info`;
        const info = await readVal(infoPath);
        if (!info) return response.notFound(res, 'College not found');

        await rtdb().ref(infoPath).update({ isActive });
        await req.audit('SET_COLLEGE_STATUS', 'college', cId, { isActive: info?.isActive !== false }, { isActive });

        return response.success(res, { collegeId: cId, isActive });
    } catch (error) {
        console.error('Set college status error:', error);
        return response.serverError(res, 'Failed to update college status');
    }
};
