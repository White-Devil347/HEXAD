const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { rtdb } = require('../firebase/firebase');
const { response, crypto, dateTime } = require('../utils');
const { auditLog } = require('../middleware/audit');
const streamRegistry = require('../utils/streamRegistry');

const PATHS = {
    collegesRoot: () => 'colleges',
    attendanceSessions: (collegeId) => `colleges/${collegeId}/sessions`,
    attendanceSession: (collegeId, sessionId) => `colleges/${collegeId}/sessions/${sessionId}`,
    sessionStats: (collegeId, sessionId) => `colleges/${collegeId}/sessions/${sessionId}/stats`,
    teacherSessions: (collegeId, teacherUid) => `colleges/${collegeId}/teacher_sessions/${teacherUid}`,
    activeCode: (collegeId, code) => `colleges/${collegeId}/active_session_codes/${code}`,
    attendanceRecords: (collegeId, sessionId) => `colleges/${collegeId}/attendance_records/${sessionId}`,
    attendanceRecord: (collegeId, sessionId, studentUid) => `colleges/${collegeId}/attendance_records/${sessionId}/${studentUid}`,
    attendanceAttempts: (collegeId, sessionId, studentUid) => `colleges/${collegeId}/attendance_attempts/${sessionId}/${studentUid}`,
    classNode: (collegeId, classId) => `colleges/${collegeId}/classes/${classId}`,
    classStudents: (collegeId, classId) => `colleges/${collegeId}/classes/${classId}/students`,
    subjectNode: (collegeId, subjectId) => `colleges/${collegeId}/subjects/${subjectId}`,
    departmentNode: (collegeId, departmentId) => `colleges/${collegeId}/departments/${departmentId}`,
    studentInfo: (collegeId, studentUid) => `colleges/${collegeId}/students/${studentUid}/info`,
    teacherAssignments: (collegeId, teacherUid) => `colleges/${collegeId}/teacher_assignments/${teacherUid}`,
    wifiNetworks: (collegeId) => `colleges/${collegeId}/wifi_networks`,
    attendanceOverrideLogs: (collegeId) => `colleges/${collegeId}/audit_logs/attendance_overrides`,
    securitySuspiciousActivities: (collegeId) => `colleges/${collegeId}/security/suspicious_activity`
};

const readVal = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.val();
};

const exists = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.exists();
};

// Some collections are stored either as:
// 1) colleges/{collegeId}/classes/{id} -> { name, code, ... }
// 2) colleges/{collegeId}/classes/{id} -> { info: { name, code, ... } }
// 3) (legacy) colleges/{collegeId}/classes/{id}/info -> { name, code, ... }
// This helper normalizes all shapes to a single info object.
const readInfoNode = async (basePath) => {
    const raw = await readVal(basePath);
    if (raw && typeof raw === 'object') {
        if (raw.info && typeof raw.info === 'object') return raw.info;
        return raw;
    }
    const legacy = await readVal(`${basePath}/info`);
    if (legacy && typeof legacy === 'object') return legacy;
    return null;
};

const countKeys = (obj) => (obj && typeof obj === 'object' ? Object.keys(obj).length : 0);

const parseTimeToMinutes = (timeValue) => {
    if (!timeValue) return null;
    const match = String(timeValue).trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
};

const computeDurationMinutes = (startTime, endTime) => {
    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);
    if (startMin === null || endMin === null) return null;
    const diff = endMin - startMin;
    return diff >= 0 ? diff : null;
};

const clampNonNegativeInt = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
};

const normalizeSessionStatus = (status) => {
    // Legacy status values (kept for backward compatibility with existing RTDB data)
    // are normalized at the API/controller layer.
    if (status === 'ended') return 'completed';
    return status;
};

const toStatsForStream = (stats) => {
    const s = (stats && typeof stats === 'object') ? stats : {};
    return {
        presentCount: clampNonNegativeInt(s.presentCount),
        lateCount: clampNonNegativeInt(s.lateCount),
        flaggedCount: clampNonNegativeInt(s.flaggedCount),
        suspiciousCount: clampNonNegativeInt(s.suspiciousCount)
    };
};

const writeSseEvent = (res, eventName, data) => {
    if (eventName) res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const getRecentSessionsForTeacher = async ({ collegeId, teacherUid, limit }) => {
    const lim = Math.max(1, Math.min(20, Number(limit) || 5));

    const indexVal = await readVal(PATHS.teacherSessions(collegeId, teacherUid)) || {};
    const sessionIds = Object.keys(indexVal).filter(Boolean);

    const sessionVals = await Promise.all(sessionIds.map((id) => readVal(PATHS.attendanceSession(collegeId, id))));
    const sessions = sessionVals.filter(Boolean);

    sessions.sort((a, b) => {
        if (a.session_date !== b.session_date) return String(b.session_date).localeCompare(String(a.session_date));
        return (b.created_at_ms || 0) - (a.created_at_ms || 0);
    });

    const pageItems = sessions.slice(0, lim);
    const statsList = await Promise.all(pageItems.map((s) => readVal(PATHS.sessionStats(collegeId, s.id))));

    return pageItems.map((s, idx) => ({
        id: s.id,
        session_code: s.session_code,
        status: normalizeSessionStatus(s.status),
        session_date: s.session_date,
        start_time: s.scheduled_start_time || null,
        end_time: s.scheduled_end_time || null,
        duration_minutes: s.duration_minutes ?? computeDurationMinutes(s.scheduled_start_time, s.scheduled_end_time),
        started_at: s.started_at || null,
        ended_at: s.ended_at || null,
        class_name: s.class_name || null,
        class_code: s.class_code || null,
        subject_name: s.subject_name || null,
        subject_code: s.subject_code || null,
        attendance_count: (clampNonNegativeInt(statsList[idx]?.presentCount) + clampNonNegativeInt(statsList[idx]?.lateCount)) ?? 0,
        total_students: s.total_students ?? null
    }));
};

const readSessionAttendancePage = async ({ collegeId, sessionId, cursor, limit }) => {
    const pageSize = Math.max(1, Math.min(500, Number(limit) || 200));
    const recordsBaseRef = rtdb().ref(PATHS.attendanceRecords(collegeId, sessionId)).orderByKey();
    const query = cursor
        ? recordsBaseRef.startAt(String(cursor)).limitToFirst(pageSize + 3)
        : recordsBaseRef.limitToFirst(pageSize + 2);

    const snap = await query.once('value');
    const raw = snap.val() || {};
    let entries = Object.entries(raw)
        .filter(([k]) => k !== 'meta')
        .filter(([k]) => Boolean(k));

    // Implement "startAfter" semantics.
    if (cursor) entries = entries.filter(([k]) => k !== String(cursor));

    const page = entries.slice(0, pageSize);
    const nextCursor = entries.length > pageSize ? page[page.length - 1]?.[0] : null;

    const studentUids = page.map(([uid]) => uid);
    const studentInfos = await Promise.all(studentUids.map((uid) => readVal(PATHS.studentInfo(collegeId, uid))));

    const attendance = studentUids.map((studentUid, idx) => {
        const record = page[idx]?.[1] || null;
        const studentInfo = studentInfos[idx] || {};
        const status = record?.status || 'absent';
        const first = studentInfo.firstName || studentInfo.first_name || null;
        const last = studentInfo.lastName || studentInfo.last_name || null;
        const studentName = `${first || ''} ${last || ''}`.trim() || null;
        return {
            id: record?.id || null,
            status,
            verification_status: record?.verification_status || 'verified',
            marked_at: record?.marked_at || null,
            marked_at_ms: record?.marked_at_ms || null,
            is_offline_marked: record?.is_offline_marked || false,
            manual_override: record?.manual_override || false,
            override_reason: record?.override_reason || null,
            is_within_geofence: record?.is_within_geofence ?? null,
            student_id: studentUid,
            roll_number: studentInfo.rollNumber || studentInfo.roll_number || null,
            first_name: first,
            last_name: last,
            student_name: studentName,
            flag: record?.flag ?? null
        };
    }).sort((a, b) => String(a.roll_number || '').localeCompare(String(b.roll_number || '')));

    return { attendance, nextCursor, limit: pageSize };
};

const safeDateString = (value, fallback = dateTime.toMySQLDate(new Date())) => {
    if (!value) return fallback;
    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    return fallback;
};

const claimActiveSessionCode = async (collegeId, sessionCode, sessionId, expiresAtMs) => {
    const ref = rtdb().ref(PATHS.activeCode(collegeId, sessionCode));
    const result = await ref.transaction((current) => {
        if (current === null) {
            return { sessionId, expiresAt: expiresAtMs };
        }

        // If this session already owns the code, extend its expiry.
        if (current && current.sessionId === sessionId) {
            return { sessionId, expiresAt: expiresAtMs };
        }

        const currentExpiresAt = Number(current.expiresAt);
        if (Number.isFinite(currentExpiresAt) && currentExpiresAt < Date.now()) {
            return { sessionId, expiresAt: expiresAtMs };
        }

        return undefined;
    }, undefined, false);

    return Boolean(result.committed);
};

const releaseActiveSessionCodeIfOwned = async (collegeId, sessionCode, sessionId) => {
    if (!sessionCode) return;
    const ref = rtdb().ref(PATHS.activeCode(collegeId, sessionCode));
    await ref.transaction((current) => {
        if (current === null) return null;
        if (current.sessionId === sessionId) return null;
        return undefined;
    }, undefined, false);
};

const getFirebaseSessionForTeacher = async (collegeId, sessionId, teacherUid) => {
    const session = await readVal(PATHS.attendanceSession(collegeId, sessionId));
    if (!session) return null;
    if (session.teacher_uid !== teacherUid) return null;
    return session;
};

const findTeacherAssignment = async (collegeId, teacherUid, classId, subjectId) => {
    const assignmentsMap = await readVal(PATHS.teacherAssignments(collegeId, teacherUid)) || {};
    const matches = Object.values(assignmentsMap)
        .filter(Boolean)
        .filter((a) => a.isActive !== false)
        .filter((a) => a.classId === classId && a.subjectId === subjectId);
    return matches[0] || null;
};

const getTeacherAssignmentById = async (collegeId, teacherUid, assignmentId) => {
    if (!assignmentId) return null;
    const assignmentsMap = await readVal(PATHS.teacherAssignments(collegeId, teacherUid)) || {};
    const assignment = assignmentsMap[assignmentId] || null;
    if (!assignment) return null;
    if (assignment.isActive === false) return null;
    return assignment;
};

const sessionExistsInAnotherCollege = async (sessionId, collegeId) => {
    const colleges = await readVal(PATHS.collegesRoot()) || {};
    const collegeIds = Object.keys(colleges).filter((id) => id && id !== collegeId);
    if (collegeIds.length === 0) return false;

    const checks = await Promise.all(collegeIds.map(async (cid) => {
        const session = await readVal(PATHS.attendanceSession(cid, sessionId));
        return Boolean(session);
    }));

    return checks.some(Boolean);
};

const toDisplayName = (info) => {
    const first = info?.firstName || info?.first_name || null;
    const last = info?.lastName || info?.last_name || null;
    const full = `${first || ''} ${last || ''}`.trim();
    if (full) return full;
    return info?.name || info?.student_name || null;
};

const toStableEmail = (info) => {
    const raw = info?.email || null;
    if (!raw) return null;
    return String(raw).trim().toLowerCase();
};

const toStudentStatus = (info) => {
    if (info?.status) return String(info.status).toLowerCase();
    if (typeof info?.isActive === 'boolean') return info.isActive ? 'active' : 'inactive';
    if (typeof info?.is_active === 'boolean') return info.is_active ? 'active' : 'inactive';
    return 'active';
};

const buildEnrolledStudentsForSession = async ({ collegeId, session }) => {
    const classId = session?.class_id || null;
    if (!classId) {
        return { sessionCode: session?.session_code || null, students: [] };
    }

    const classStudents = await readVal(PATHS.classStudents(collegeId, classId)) || {};
    const studentUids = Object.keys(classStudents).filter(Boolean);
    if (studentUids.length === 0) {
        return { sessionCode: session?.session_code || null, students: [] };
    }

    const infos = await Promise.all(studentUids.map((uid) => readVal(PATHS.studentInfo(collegeId, uid))));

    const students = studentUids.map((uid, idx) => {
        const info = infos[idx] || {};
        return {
            officialStudentId: uid,
            email: toStableEmail(info),
            name: toDisplayName(info),
            status: toStudentStatus(info)
        };
    }).sort((a, b) => String(a.email || '').localeCompare(String(b.email || '')));

    return {
        sessionCode: session?.session_code || null,
        students
    };
};

// ==================== ASSIGNMENTS ====================

exports.getAssignments = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId on user profile', 400);

        const assignmentsMap = await readVal(PATHS.teacherAssignments(collegeId, req.user.uid)) || {};
        const items = Object.entries(assignmentsMap)
            .map(([assignmentId, a]) => ({ id: assignmentId, assignmentId, ...a }))
            .filter((a) => a && a.isActive !== false);

        const enriched = await Promise.all(items.map(async (a) => {
            const [classInfo, subjectInfo] = await Promise.all([
                readInfoNode(PATHS.classNode(collegeId, a.classId)),
                readInfoNode(PATHS.subjectNode(collegeId, a.subjectId))
            ]);

            const departmentId = classInfo?.departmentId || null;
            const departmentInfo = departmentId ? await readInfoNode(PATHS.departmentNode(collegeId, departmentId)) : null;
            const studentsIndex = await readVal(PATHS.classStudents(collegeId, a.classId));

            return {
                id: a.assignmentId || null,
                class_id: a.classId,
                subject_id: a.subjectId,
                academic_year: a.academicYear || a.academic_year || null,
                class_name: classInfo?.name || null,
                class_code: classInfo?.code || null,
                subject_name: subjectInfo?.name || null,
                subject_code: subjectInfo?.code || null,
                department_id: departmentId,
                department_name: departmentInfo?.name || null,
                student_count: countKeys(studentsIndex)
            };
        }));

        return response.success(res, enriched);
    } catch (error) {
        console.error('Get assignments error:', error);
        return response.serverError(res, 'Failed to fetch assignments');
    }
};

// ==================== SESSIONS ====================

exports.createSession = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId on user profile', 400);

        const body = req.body || {};
        const assignmentId = body.assignmentId || body.assignment_id || null;

        let classId = body.classId || body.class_id || null;
        let subjectId = body.subjectId || body.subject_id || null;

        const sessionDate = body.sessionDate || body.session_date || null;
        const startTime = body.startTime || body.start_time || null;
        const endTime = body.endTime || body.end_time || null;
        const notes = body.notes || null;

        const geoLatitude = body.geoLatitude ?? body.geo_latitude ?? null;
        const geoLongitude = body.geoLongitude ?? body.geo_longitude ?? null;
        const geoRadius = body.geoRadius || body.geo_radius_meters || body.geofence_radius_meters || null;

        const durationMinutesInput = body.durationMinutes ?? body.duration_minutes ?? null;
        const lateThresholdMinutes = body.lateThresholdMinutes ?? body.late_threshold_minutes ?? null;
        const requirePhoto = body.requirePhoto ?? body.require_photo ?? null;
        const requireLocation = body.requireLocation ?? body.require_location ?? null;
        const requireWifi = body.requireWifi ?? body.require_wifi ?? null;

        let assignment = null;
        if (assignmentId) {
            assignment = await getTeacherAssignmentById(collegeId, req.user.uid, assignmentId);
            if (!assignment) return response.forbidden(res, 'Invalid or inactive assignment');
            classId = assignment.classId;
            subjectId = assignment.subjectId;
        } else {
            assignment = await findTeacherAssignment(collegeId, req.user.uid, classId, subjectId);
        }

        if (!assignment || !classId || !subjectId) {
            return response.forbidden(res, 'You are not assigned to this class-subject');
        }

        const sessionId = uuidv4();
        const codeExpiresAt = dateTime.addMinutes(new Date(), config.session.codeValidityMinutes);
        const codeExpiresAtMs = codeExpiresAt.getTime();

        let sessionCode;
        let claimed = false;
        while (!claimed) {
            sessionCode = crypto.generateSessionCode(6);
            claimed = await claimActiveSessionCode(collegeId, sessionCode, sessionId, codeExpiresAtMs);
        }

        const [wifiNetworksMap, classInfo, subjectInfo, classStudentsIndex] = await Promise.all([
            readVal(PATHS.wifiNetworks(collegeId)),
            readInfoNode(PATHS.classNode(collegeId, classId)),
            readInfoNode(PATHS.subjectNode(collegeId, subjectId)),
            readVal(PATHS.classStudents(collegeId, classId))
        ]);

        const wifiSsids = Object.values(wifiNetworksMap || {})
            .map((n) => n?.ssid)
            .filter(Boolean);

        const effectiveSessionDate = safeDateString(sessionDate);
        const computedDuration = computeDurationMinutes(startTime, endTime);
        const durationMinutes = computedDuration ?? (Number.isFinite(Number(durationMinutesInput)) ? Number(durationMinutesInput) : null);

        const firebaseSession = {
            id: sessionId,
            college_id: collegeId,
            teacher_uid: req.user.uid,
            class_id: classId,
            subject_id: subjectId,
            session_code: sessionCode,
            session_name: `${subjectInfo?.name || 'Subject'} - ${classInfo?.name || 'Class'} - ${effectiveSessionDate}`,
            session_code_expires_at: codeExpiresAt.toISOString(),
            session_code_expires_at_ms: codeExpiresAtMs,
            status: 'scheduled',
            session_date: effectiveSessionDate,
            scheduled_start_time: startTime || null,
            scheduled_end_time: endTime || null,
            duration_minutes: durationMinutes,
            late_threshold_minutes: Number.isFinite(Number(lateThresholdMinutes)) ? Number(lateThresholdMinutes) : null,
            require_photo: typeof requirePhoto === 'boolean' ? requirePhoto : null,
            require_location: typeof requireLocation === 'boolean' ? requireLocation : null,
            require_wifi: typeof requireWifi === 'boolean' ? requireWifi : null,
            started_at: null,
            ended_at: null,
            geo_latitude: geoLatitude ?? null,
            geo_longitude: geoLongitude ?? null,
            geo_radius_meters: geoRadius || 100,
            allowed_wifi_ssids: wifiSsids,
            notes: notes || null,
            class_name: classInfo?.name || null,
            class_code: classInfo?.code || null,
            subject_name: subjectInfo?.name || null,
            subject_code: subjectInfo?.code || null,
            total_students: countKeys(classStudentsIndex),
            created_at_ms: Date.now(),
            created_at: new Date().toISOString(),
            created_at_readable: new Date().toLocaleString()
        };

        await rtdb().ref(PATHS.attendanceSession(collegeId, sessionId)).set(firebaseSession);
        await rtdb().ref(`${PATHS.attendanceRecords(collegeId, sessionId)}/meta`).update({
            session_code: sessionCode,
            class_name: firebaseSession.class_name || null,
            subject_name: firebaseSession.subject_name || null
        });
        await rtdb().ref(`${PATHS.teacherSessions(collegeId, req.user.uid)}/${sessionId}`).set({
            created_at_ms: firebaseSession.created_at_ms,
            session_date: firebaseSession.session_date,
            status: firebaseSession.status
        });

        await req.audit('CREATE_SESSION', 'attendance_session', sessionId, null, { classId, subjectId, assignmentId });

        return response.created(res, {
            sessionId,
            sessionCode,
            codeExpiresAt,
            codeValidityMinutes: config.session.codeValidityMinutes
        }, 'Attendance session created');
    } catch (error) {
        console.error('Create session error:', error);
        return response.serverError(res, 'Failed to create session');
    }
};

exports.regenerateCode = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const { sessionId } = req.params;

        const session = await getFirebaseSessionForTeacher(collegeId, sessionId, req.user.uid);
        if (!session) return response.notFound(res, 'Session not found');
        if (session.status === 'completed' || session.status === 'ended' || session.status === 'cancelled') {
            return response.error(res, 'Cannot regenerate code for ended/cancelled session');
        }

        const previousCode = session.session_code;
        const codeExpiresAt = dateTime.addMinutes(new Date(), config.session.codeValidityMinutes);
        const codeExpiresAtMs = codeExpiresAt.getTime();

        let sessionCode;
        let claimed = false;
        while (!claimed) {
            sessionCode = crypto.generateSessionCode(6);
            claimed = await claimActiveSessionCode(collegeId, sessionCode, sessionId, codeExpiresAtMs);
        }

        await rtdb().ref(PATHS.attendanceSession(collegeId, sessionId)).update({
            session_code: sessionCode,
            session_code_expires_at: codeExpiresAt.toISOString(),
            session_code_expires_at_ms: codeExpiresAtMs
        });

        await releaseActiveSessionCodeIfOwned(collegeId, previousCode, sessionId);

        return response.success(res, {
            sessionCode,
            codeExpiresAt,
            codeValidityMinutes: config.session.codeValidityMinutes
        }, 'Session code regenerated');
    } catch (error) {
        console.error('Regenerate code error:', error);
        return response.serverError(res, 'Failed to regenerate code');
    }
};

exports.startSession = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const { sessionId } = req.params;

        const session = await getFirebaseSessionForTeacher(collegeId, sessionId, req.user.uid);
        if (!session) return response.notFound(res, 'Session not found');
        if (session.status !== 'scheduled') {
            return response.error(res, `Cannot start session in ${session.status} status`);
        }

        const previousCode = session.session_code;
        const codeExpiresAt = dateTime.addMinutes(new Date(), config.session.codeValidityMinutes);
        const codeExpiresAtMs = codeExpiresAt.getTime();

        // Keep the original code from creation whenever possible.
        let sessionCode = previousCode;
        let claimed = false;
        if (sessionCode) {
            claimed = await claimActiveSessionCode(collegeId, sessionCode, sessionId, codeExpiresAtMs);
        }
        while (!claimed) {
            sessionCode = crypto.generateSessionCode(6);
            claimed = await claimActiveSessionCode(collegeId, sessionCode, sessionId, codeExpiresAtMs);
        }

        const startedAtIso = new Date().toISOString();

        const studentsIndex = await readVal(PATHS.classStudents(collegeId, session.class_id)) || {};
        const studentUids = Object.keys(studentsIndex);
        const recordsPath = PATHS.attendanceRecords(collegeId, sessionId);
        const existingRecords = await readVal(recordsPath) || {};
        const nowMs = Date.now();

        const updates = {
            [`${PATHS.attendanceSession(collegeId, sessionId)}/status`]: 'active',
            [`${PATHS.attendanceSession(collegeId, sessionId)}/started_at`]: startedAtIso,
            [`${PATHS.attendanceSession(collegeId, sessionId)}/session_code`]: sessionCode,
            [`${PATHS.attendanceSession(collegeId, sessionId)}/session_code_expires_at`]: codeExpiresAt.toISOString(),
            [`${PATHS.attendanceSession(collegeId, sessionId)}/session_code_expires_at_ms`]: codeExpiresAtMs,
            [`${PATHS.teacherSessions(collegeId, req.user.uid)}/${sessionId}/status`]: 'active',
            [`${recordsPath}/meta/session_code`]: sessionCode
        };

        updates[PATHS.sessionStats(collegeId, sessionId)] = {
            presentCount: 0,
            lateCount: 0,
            flaggedCount: 0,
            suspiciousCount: 0,
            totalAttempts: 0,
            totalStudents: studentUids.length,
            updated_at_ms: nowMs
        };

        for (const studentUid of studentUids) {
            if (studentUid === 'meta') continue;
            if (existingRecords[studentUid]) continue;
            updates[PATHS.attendanceRecord(collegeId, sessionId, studentUid)] = {
                id: uuidv4(),
                session_id: sessionId,
                student_id: studentUid,
                status: 'absent',
                verification_status: 'unverified',
                manual_override: false,
                override_reason: null,
                marked_at: null,
                marked_at_ms: null,
                is_offline_marked: false,
                is_within_geofence: null,
                wifi_ssid: null,
                photo_url: null,
                device_id: null,
                latitude: null,
                longitude: null,
                location_accuracy_meters: null,
                flag: null,
                created_at_ms: nowMs
            };
        }

        await rtdb().ref().update(updates);

        if (previousCode && previousCode !== sessionCode) {
            await releaseActiveSessionCodeIfOwned(collegeId, previousCode, sessionId);
        }

        await req.audit('START_SESSION', 'attendance_session', sessionId);

        return response.success(res, {
            sessionCode,
            codeExpiresAt,
            startedAt: new Date(startedAtIso)
        }, 'Session started');
    } catch (error) {
        console.error('Start session error:', error);
        return response.serverError(res, 'Failed to start session');
    }
};

exports.endSession = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const { sessionId } = req.params;

        const session = await getFirebaseSessionForTeacher(collegeId, sessionId, req.user.uid);
        if (!session) return response.notFound(res, 'Session not found');
        if (session.status === 'completed' || session.status === 'ended' || session.status === 'cancelled') {
            return response.error(res, 'Session already ended');
        }

        const endedAtIso = new Date().toISOString();
        const endedAtMs = Date.now();

        await rtdb().ref(PATHS.attendanceSession(collegeId, sessionId)).update({
            status: 'completed',
            ended_at: endedAtIso,
            ended_at_ms: endedAtMs
        });
        await rtdb().ref(`${PATHS.teacherSessions(collegeId, req.user.uid)}/${sessionId}`).update({ status: 'completed' });

        const studentsIndex = await readVal(PATHS.classStudents(collegeId, session.class_id)) || {};
        const studentUids = Object.keys(studentsIndex);
        const nowMs = Date.now();

        const recordsPath = PATHS.attendanceRecords(collegeId, sessionId);
        const existingRecords = await readVal(recordsPath) || {};

        const updates = {};
        for (const studentUid of studentUids) {
            if (existingRecords[studentUid]) continue;
            updates[`colleges/${collegeId}/attendance_records/${sessionId}/${studentUid}`] = {
                status: 'absent',
                verification_status: 'unverified',
                marked_at_ms: null,
                marked_at: null,
                manual_override: false,
                created_at_ms: nowMs
            };
        }

        if (Object.keys(updates).length > 0) {
            await rtdb().ref().update(updates);
        }

        await releaseActiveSessionCodeIfOwned(collegeId, session.session_code, sessionId);

        await req.audit('END_SESSION', 'attendance_session', sessionId);

        return response.success(res, { endedAt: new Date(endedAtIso) }, 'Session ended');
    } catch (error) {
        console.error('End session error:', error);
        return response.serverError(res, 'Failed to end session');
    }
};

exports.getSession = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const { sessionId } = req.params;

        const q = req.query || {};
        const includeAttendance = String(q.includeAttendance ?? 'true') !== 'false';
        const limit = q.limit || q.pageSize || 200;
        const cursor = q.cursor || q.startAfter || null;

        const session = await getFirebaseSessionForTeacher(collegeId, sessionId, req.user.uid);
        if (!session) return response.notFound(res, 'Session not found');

        const stats = await readVal(PATHS.sessionStats(collegeId, sessionId));

        const sessionForUi = {
            ...session,
            start_time: session.scheduled_start_time || session.start_time || null,
            end_time: session.scheduled_end_time || session.end_time || null
        };

        const statsForUi = {
            presentCount: clampNonNegativeInt(stats?.presentCount),
            lateCount: clampNonNegativeInt(stats?.lateCount),
            flaggedCount: clampNonNegativeInt(stats?.flaggedCount),
            suspiciousCount: clampNonNegativeInt(stats?.suspiciousCount),
            totalAttempts: clampNonNegativeInt(stats?.totalAttempts),
            totalStudents: clampNonNegativeInt(stats?.totalStudents ?? session.total_students)
        };

        let attendance = [];
        let page = null;
        if (includeAttendance) {
            const pageResult = await readSessionAttendancePage({ collegeId, sessionId, cursor, limit });
            attendance = pageResult.attendance;
            page = { limit: pageResult.limit, nextCursor: pageResult.nextCursor };
        }

        const total = statsForUi.totalStudents || (includeAttendance ? attendance.length : null);
        const presentOrLate = statsForUi.presentCount + statsForUi.lateCount;
        const absent = Number.isFinite(total) ? Math.max(0, total - presentOrLate) : null;

        const summary = {
            total,
            present: statsForUi.presentCount,
            late: statsForUi.lateCount,
            absent,
            flagged: statsForUi.flaggedCount,
            suspicious: statsForUi.suspiciousCount
        };

        return response.success(res, { session: sessionForUi, stats: statsForUi, attendance, page, summary });
    } catch (error) {
        console.error('Get session error:', error);
        return response.serverError(res, 'Failed to fetch session');
    }
};

exports.getSessionEnrolledStudentsInternal = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const collegeId = String(req.query?.collegeId || '').trim();

        if (!collegeId) {
            return response.error(res, 'collegeId is required', 400);
        }

        const session = await readVal(PATHS.attendanceSession(collegeId, sessionId));
        if (!session) {
            const existsElsewhere = await sessionExistsInAnotherCollege(sessionId, collegeId);
            if (existsElsewhere) return response.forbidden(res, 'Session does not belong to the provided collegeId');
            return response.notFound(res, 'Session not found');
        }

        const roster = await buildEnrolledStudentsForSession({ collegeId, session });

        await auditLog(
            'internal-simulator',
            'GET_SESSION_ENROLLED_STUDENTS',
            'session',
            sessionId,
            null,
            {
                collegeId,
                sessionCode: roster.sessionCode,
                studentsCount: roster.students.length,
                source: 'internal'
            },
            req
        );

        return res.status(200).json({
            success: true,
            sessionId,
            sessionCode: roster.sessionCode,
            students: roster.students
        });
    } catch (error) {
        console.error('Get internal enrolled students error:', error);
        return response.serverError(res, 'Failed to fetch enrolled students');
    }
};

exports.getSessions = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId on user profile', 400);
        const q = req.query || {};
        const page = q.page || 1;
        const limit = q.limit || 20;
        const statusRaw = q.status || null;
        const status = statusRaw === 'ended' ? 'completed' : statusRaw;
        const classId = q.classId || q.class_id || null;
        const subjectId = q.subjectId || q.subject_id || null;
        const dateFrom = q.dateFrom || q.start_date || null;
        const dateTo = q.dateTo || q.end_date || null;
        const { limit: lim, offset } = response.paginate(page, limit);

        const indexVal = await readVal(PATHS.teacherSessions(collegeId, req.user.uid)) || {};
        const sessionIds = Object.keys(indexVal);

        const sessionVals = await Promise.all(sessionIds.map((id) => readVal(PATHS.attendanceSession(collegeId, id))));
        let sessions = sessionVals.filter(Boolean);

        if (status) sessions = sessions.filter((s) => normalizeSessionStatus(s.status) === status);
        if (classId) sessions = sessions.filter((s) => s.class_id === classId);
        if (subjectId) sessions = sessions.filter((s) => s.subject_id === subjectId);
        if (dateFrom) sessions = sessions.filter((s) => s.session_date >= dateFrom);
        if (dateTo) sessions = sessions.filter((s) => s.session_date <= dateTo);

        sessions.sort((a, b) => {
            if (a.session_date !== b.session_date) return String(b.session_date).localeCompare(String(a.session_date));
            return (b.created_at_ms || 0) - (a.created_at_ms || 0);
        });

        const total = sessions.length;
        const pageItems = sessions.slice(offset, offset + lim);

        const statsList = await Promise.all(pageItems.map((s) => readVal(PATHS.sessionStats(collegeId, s.id))));

        const result = pageItems.map((s, idx) => ({
            id: s.id,
            session_code: s.session_code,
            status: normalizeSessionStatus(s.status),
            session_date: s.session_date,
            start_time: s.scheduled_start_time || null,
            end_time: s.scheduled_end_time || null,
            duration_minutes: s.duration_minutes ?? computeDurationMinutes(s.scheduled_start_time, s.scheduled_end_time),
            started_at: s.started_at || null,
            ended_at: s.ended_at || null,
            class_name: s.class_name || null,
            class_code: s.class_code || null,
            subject_name: s.subject_name || null,
            subject_code: s.subject_code || null,
            attendance_count: (clampNonNegativeInt(statsList[idx]?.presentCount) + clampNonNegativeInt(statsList[idx]?.lateCount)) ?? 0,
            total_students: s.total_students ?? null
        }));

        return response.paginatedResponse(res, result, total, parseInt(page), lim);
    } catch (error) {
        console.error('Get sessions error:', error);
        return response.serverError(res, 'Failed to fetch sessions');
    }
};

exports.overrideAttendance = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const { sessionId } = req.params;
        const body = req.body || {};
        const studentId = body.studentId || body.student_id;
        const status = body.status;
        const reason = body.reason;

        const session = await getFirebaseSessionForTeacher(collegeId, sessionId, req.user.uid);
        if (!session) return response.notFound(res, 'Session not found');

        const studentInClass = await exists(`${PATHS.classStudents(collegeId, session.class_id)}/${studentId}`);
        if (!studentInClass) return response.notFound(res, 'Student not found in this class');

        const recordPath = PATHS.attendanceRecord(collegeId, sessionId, studentId);
        const existing = await readVal(recordPath);

        const nowMs = Date.now();
        const record = {
            id: existing?.id || uuidv4(),
            session_id: sessionId,
            student_id: studentId,
            status,
            verification_status: 'manual',
            manual_override: true,
            override_reason: reason || null,
            override_by: req.user.uid,
            marked_at_ms: nowMs,
            marked_at: new Date(nowMs).toISOString(),
            updated_at_ms: nowMs
        };

        await rtdb().ref(recordPath).set(record);

        // Keep aggregated stats consistent (best-effort).
        try {
            const prevStatus = String(existing?.status || 'absent').toLowerCase();
            const prevVerification = String(existing?.verification_status || '').toLowerCase();
            const nextStatus = String(status || 'absent').toLowerCase();

            const prevCounted = prevVerification !== 'flagged';
            const nextCounted = true; // manual override is treated as non-flagged

            const statsRef = rtdb().ref(PATHS.sessionStats(collegeId, sessionId));
            await statsRef.transaction((current) => {
                const base = (current && typeof current === 'object') ? current : {};
                let presentCount = clampNonNegativeInt(base.presentCount);
                let lateCount = clampNonNegativeInt(base.lateCount);
                let flaggedCount = clampNonNegativeInt(base.flaggedCount);

                if (prevVerification === 'flagged') flaggedCount = clampNonNegativeInt(flaggedCount - 1);
                if (prevCounted) {
                    if (prevStatus === 'present') presentCount = clampNonNegativeInt(presentCount - 1);
                    if (prevStatus === 'late') lateCount = clampNonNegativeInt(lateCount - 1);
                }

                if (nextCounted) {
                    if (nextStatus === 'present') presentCount += 1;
                    if (nextStatus === 'late') lateCount += 1;
                }

                return {
                    ...base,
                    presentCount,
                    lateCount,
                    flaggedCount,
                    updated_at_ms: nowMs
                };
            }, undefined, false);
        } catch (e) {
            console.warn('Failed to update session stats for manual override (best-effort):', e);
        }

        const overrideId = uuidv4();
        await rtdb().ref(`${PATHS.attendanceOverrideLogs(collegeId)}/${overrideId}`).set({
            id: overrideId,
            sessionId,
            studentId,
            teacherUid: req.user.uid,
            previousStatus: existing?.status || null,
            newStatus: status,
            reason: reason || null,
            created_at_ms: nowMs
        });

        await req.audit('OVERRIDE_ATTENDANCE', 'attendance_record', record.id, { status: existing?.status || null }, { status, reason });

        return response.success(res, null, 'Attendance updated successfully');
    } catch (error) {
        console.error('Override attendance error:', error);
        return response.serverError(res, 'Failed to update attendance');
    }
};

exports.streamSessionStats = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const { sessionId } = req.params;

        const session = await getFirebaseSessionForTeacher(collegeId, sessionId, req.user.uid);
        if (!session) return response.notFound(res, 'Session not found');

        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        streamRegistry.increment('teacher-session-stats');
        res.write('retry: 3000\n\n');

        const statsRef = rtdb().ref(PATHS.sessionStats(collegeId, sessionId));
        let lastSent = null;

        const onValue = (snap) => {
            const payload = toStatsForStream(snap.val());
            if (!lastSent) {
                writeSseEvent(res, 'init', payload);
                lastSent = payload;
                return;
            }

            const delta = {};
            Object.keys(payload).forEach((k) => {
                if (payload[k] !== lastSent[k]) delta[k] = payload[k];
            });

            if (Object.keys(delta).length > 0) {
                writeSseEvent(res, 'delta', delta);
                lastSent = { ...lastSent, ...delta };
            }
        };

        statsRef.on('value', onValue);

        const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 25_000);

        req.on('close', () => {
            clearInterval(keepAlive);
            statsRef.off('value', onValue);
            streamRegistry.decrement('teacher-session-stats');
        });
    } catch (error) {
        console.error('Stream session stats error:', error);
        return response.serverError(res, 'Failed to open session stream');
    }
};

// Lightweight dashboard stream: periodic snapshot to avoid per-session listeners.
exports.streamDashboard = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const teacherUid = req.user.uid;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        streamRegistry.increment('teacher-dashboard');
        res.write('retry: 3000\n\n');

        let closed = false;
        const sendSnapshot = async () => {
            if (closed) return;
            const nowMs = Date.now();
            const recentSessions = await getRecentSessionsForTeacher({ collegeId, teacherUid, limit: 5 });
            writeSseEvent(res, 'dashboard', {
                nowMs,
                recentSessions
            });
        };

        await sendSnapshot();

        const interval = setInterval(() => {
            sendSnapshot().catch((e) => console.warn('Teacher dashboard SSE snapshot failed:', e));
        }, 10_000);

        const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 25_000);

        req.on('close', () => {
            closed = true;
            clearInterval(interval);
            clearInterval(keepAlive);
            streamRegistry.decrement('teacher-dashboard');
        });
    } catch (error) {
        console.error('Stream dashboard error:', error);
        return response.serverError(res, 'Failed to open dashboard stream');
    }
};

exports.getSecuritySummary = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const nowMs = Date.now();
        const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;

        const snap = await rtdb().ref(PATHS.securitySuspiciousActivities(collegeId))
            .orderByChild('timestamp_ms')
            .startAt(sevenDaysAgoMs)
            .limitToLast(2000)
            .once('value');

        const items = Object.values(snap.val() || {}).filter(Boolean);
        const unresolved = items.filter((a) => a.resolved !== true);

        const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
        unresolved.forEach((a) => {
            const t = String(a.type || '').toUpperCase();
            if (counts[t] !== undefined) counts[t] += 1;
        });

        return response.success(res, {
            windowDays: 7,
            unresolvedTotal: unresolved.length,
            bySeverity: counts
        });
    } catch (error) {
        console.error('Get security summary error:', error);
        return response.serverError(res, 'Failed to fetch security summary');
    }
};

exports.getSecurityList = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const q = req.query || {};
        const limit = Math.max(1, Math.min(200, Number(q.limit) || 50));
        const severity = q.severity ? String(q.severity).toUpperCase() : null;
        const resolved = q.resolved === 'true' ? true : q.resolved === 'false' ? false : null;
        const cursorMsRaw = q.cursor ? Number(q.cursor) : null;
        const cursorMs = Number.isFinite(cursorMsRaw) ? cursorMsRaw : null;

        let ref = rtdb().ref(PATHS.securitySuspiciousActivities(collegeId)).orderByChild('timestamp_ms');
        if (cursorMs !== null) {
            // endAt is inclusive; subtract 1 to reduce duplicates.
            ref = ref.endAt(cursorMs - 1);
        }

        const snap = await ref.limitToLast(limit * 4).once('value');
        let list = Object.values(snap.val() || {}).filter(Boolean);

        if (severity) list = list.filter((a) => String(a.type || '').toUpperCase() === severity);
        if (resolved !== null) list = list.filter((a) => Boolean(a.resolved) === resolved);

        list.sort((a, b) => (b.timestamp_ms || 0) - (a.timestamp_ms || 0));
        const pageItems = list.slice(0, limit);
        const nextCursor = pageItems.length > 0 ? pageItems[pageItems.length - 1].timestamp_ms || null : null;

        return response.success(res, {
            items: pageItems,
            nextCursor
        });
    } catch (error) {
        console.error('Get security list error:', error);
        return response.serverError(res, 'Failed to fetch security activities');
    }
};

exports.getAttendanceAttempts = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const { sessionId, studentId } = req.params;

        const session = await getFirebaseSessionForTeacher(collegeId, sessionId, req.user.uid);
        if (!session) return response.notFound(res, 'Session not found');

        const attemptsMap = await readVal(PATHS.attendanceAttempts(collegeId, sessionId, studentId)) || {};
        const attempts = Object.values(attemptsMap).filter(Boolean);
        attempts.sort((a, b) => (a.attempt_time_ms || 0) - (b.attempt_time_ms || 0));

        const firstFailed = attempts.find((a) => a.success === false) || null;
        const lastSuccess = [...attempts].reverse().find((a) => a.success === true) || null;

        return response.success(res, {
            firstFailedAttempt: firstFailed,
            lastSuccessfulAttempt: lastSuccess
        });
    } catch (error) {
        console.error('Get attempts error:', error);
        return response.serverError(res, 'Failed to fetch attempts');
    }
};

exports.getFlaggedStudents = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const { sessionId } = req.params;

        const session = await getFirebaseSessionForTeacher(collegeId, sessionId, req.user.uid);
        if (!session) return response.notFound(res, 'Session not found');

        const studentsIndex = await readVal(PATHS.classStudents(collegeId, session.class_id)) || {};
        const studentUids = Object.keys(studentsIndex);

        const [recordsMap, studentInfos] = await Promise.all([
            readVal(PATHS.attendanceRecords(collegeId, sessionId)),
            Promise.all(studentUids.map((uid) => readVal(PATHS.studentInfo(collegeId, uid))))
        ]);

        const repeatedFailures = [];
        const lateSubmissions = [];

        for (let i = 0; i < studentUids.length; i++) {
            const studentUid = studentUids[i];
            const info = studentInfos[i] || {};
            const record = recordsMap?.[studentUid] || null;

            const roll = info.rollNumber || info.roll_number || null;
            const first = info.firstName || info.first_name || null;
            const last = info.lastName || info.last_name || null;

            if (record?.status === 'late') {
                lateSubmissions.push({
                    student_id: studentUid,
                    roll_number: roll,
                    first_name: first,
                    last_name: last,
                    marked_at: record.marked_at || null,
                    status: record.status
                });
            }

            const attemptsMap = await readVal(PATHS.attendanceAttempts(collegeId, sessionId, studentUid)) || {};
            const failureCount = Object.values(attemptsMap).filter((a) => a && a.success === false).length;
            if (failureCount >= 3) {
                repeatedFailures.push({
                    student_id: studentUid,
                    roll_number: roll,
                    first_name: first,
                    last_name: last,
                    failure_count: failureCount
                });
            }
        }

        repeatedFailures.sort((a, b) => (b.failure_count || 0) - (a.failure_count || 0));
        lateSubmissions.sort((a, b) => String(b.marked_at || '').localeCompare(String(a.marked_at || '')));

        return response.success(res, { repeatedFailures, lateSubmissions });
    } catch (error) {
        console.error('Get flagged students error:', error);
        return response.serverError(res, 'Failed to fetch flagged students');
    }
};
