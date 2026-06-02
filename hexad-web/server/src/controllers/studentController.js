const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { rtdb } = require('../firebase/firebase');
const { response } = require('../utils');

const PATHS = {
    activeCode: (collegeId, code) => `colleges/${collegeId}/active_session_codes/${code}`,
    attendanceSession: (collegeId, sessionId) => `colleges/${collegeId}/sessions/${sessionId}`,
    sessionStats: (collegeId, sessionId) => `colleges/${collegeId}/sessions/${sessionId}/stats`,
    classStudents: (collegeId, classId) => `colleges/${collegeId}/classes/${classId}/students`,
    attendanceRecord: (collegeId, sessionId, studentUid) => `colleges/${collegeId}/attendance_records/${sessionId}/${studentUid}`,
    attendanceAttempt: (collegeId, sessionId, studentUid, attemptId) => `colleges/${collegeId}/attendance_attempts/${sessionId}/${studentUid}/${attemptId}`,
    suspiciousActivity: (collegeId, activityId) => `colleges/${collegeId}/suspicious_activities/${activityId}`,

    securityLogoutLogs: (collegeId, studentUid) => `colleges/${collegeId}/security/logout_logs/${studentUid}`,
    securityDeviceMap: (collegeId, studentUid) => `colleges/${collegeId}/security/device_map/${studentUid}`,
    securityDeviceIndex: (collegeId, deviceId) => `colleges/${collegeId}/security/device_index/${deviceId}`,
    securityDeviceSessionMap: (collegeId, sessionId, deviceId) => `colleges/${collegeId}/security/device_session_map/${sessionId}/${deviceId}`,
    securitySuspiciousActivity: (collegeId, activityId) => `colleges/${collegeId}/security/suspicious_activity/${activityId}`,
    securitySuspicionScore: (collegeId, studentUid) => `colleges/${collegeId}/security/suspicion_scores/${studentUid}`
};

const readVal = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.val();
};

const exists = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.exists();
};

const normalizeCode = (raw) => String(raw || '').trim().toUpperCase();

const getInternalKey = (req) => {
    if (!req || typeof req.get !== 'function') return null;
    return req.get('x-hexad-internal-key') || req.get('x-internal-key') || null;
};

const isTrustedAttendanceBypass = (req) => {
    const required = config?.internal?.attendanceBypassKey;
    if (!required) return false;
    const provided = getInternalKey(req);
    return Boolean(provided && String(provided) === String(required));
};

const parseHhMm = (value) => {
    const match = String(value || '').trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return { hours, minutes };
};

const parseSessionScheduledEndMs = (session) => {
    const dateStr = String(session?.session_date || '').trim();
    const timeStr = session?.scheduled_end_time;
    if (!dateStr || !timeStr) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

    const parts = parseHhMm(timeStr);
    if (!parts) return null;

    const [y, m, d] = dateStr.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    const dt = new Date(y, m - 1, d, parts.hours, parts.minutes, 0, 0);
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : null;
};

const buildSessionClosedError = () => ({
    success: false,
    message: 'Session closed',
    error: 'SESSION_CLOSED'
});

const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const resolveActiveSessionByCode = async (collegeId, sessionCode) => {
    const code = normalizeCode(sessionCode);
    if (!code) return null;

    const active = await readVal(PATHS.activeCode(collegeId, code));
    if (!active || !active.sessionId) return null;

    const expiresAt = Number(active.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return null;

    const session = await readVal(PATHS.attendanceSession(collegeId, active.sessionId));
    if (!session) return null;

    return { code, sessionId: active.sessionId, session };
};

const logAttempt = async ({ collegeId, sessionId, studentUid, success, reason, data }) => {
    const attemptId = uuidv4();
    const nowMs = Date.now();
    const payload = {
        id: attemptId,
        success: Boolean(success),
        reason: reason || null,
        attempt_time_ms: nowMs,
        attempt_time: new Date(nowMs).toISOString(),
        student_uid: studentUid,
        ...(data || {})
    };

    await rtdb().ref(PATHS.attendanceAttempt(collegeId, sessionId, studentUid, attemptId)).set(payload);
};

const computeAttendanceStatus = (session, nowMs) => {
    const threshold = Number(session?.late_threshold_minutes);
    if (!Number.isFinite(threshold) || threshold < 0) return 'present';

    const startedAt = session?.started_at;
    const startedAtMs = startedAt ? Date.parse(startedAt) : NaN;
    if (!Number.isFinite(startedAtMs)) return 'present';

    return nowMs > startedAtMs + threshold * 60 * 1000 ? 'late' : 'present';
};

const updateSessionStatsAfterCommit = async ({ collegeId, sessionId, status, verificationStatus, wroteSuspiciousActivity, nowMs }) => {
    const statsRef = rtdb().ref(PATHS.sessionStats(collegeId, sessionId));

    await statsRef.transaction((current) => {
        const base = (current && typeof current === 'object') ? current : {};
        const presentCount = Number(base.presentCount) || 0;
        const lateCount = Number(base.lateCount) || 0;
        const flaggedCount = Number(base.flaggedCount) || 0;
        const suspiciousCount = Number(base.suspiciousCount) || 0;
        const totalAttempts = Number(base.totalAttempts) || 0;

        const isFlagged = String(verificationStatus || '').toLowerCase() === 'flagged';
        const next = {
            ...base,
            presentCount,
            lateCount,
            flaggedCount,
            suspiciousCount,
            totalAttempts,
            updated_at_ms: nowMs
        };

        next.totalAttempts = totalAttempts + 1;
        if (isFlagged) next.flaggedCount = flaggedCount + 1;
        if (wroteSuspiciousActivity) next.suspiciousCount = suspiciousCount + 1;

        // UX rule: flagged submissions do not count as present/late until manual review.
        if (!isFlagged) {
            const s = String(status || '').toLowerCase();
            if (s === 'present') next.presentCount = presentCount + 1;
            if (s === 'late') next.lateCount = lateCount + 1;
        }

        return next;
    }, undefined, false);
};

const incrementSuspicionScore = async ({ collegeId, studentUid, delta, nowMs }) => {
    if (!studentUid) return;
    const ref = rtdb().ref(PATHS.securitySuspicionScore(collegeId, studentUid));
    await ref.transaction((current) => {
        const base = (current && typeof current === 'object') ? current : {};
        const score = Number(base.score) || 0;
        return {
            ...base,
            score: score + (Number(delta) || 0),
            updated_at_ms: nowMs
        };
    }, undefined, false);
};

const writeSecuritySuspiciousActivity = async ({ collegeId, activity }) => {
    const id = activity?.id || uuidv4();
    const payload = { ...activity, id };
    // New canonical path (per V2 spec)
    await rtdb().ref(PATHS.securitySuspiciousActivity(collegeId, id)).set(payload);
    // Legacy path (existing admin monitoring UI)
    await rtdb().ref(PATHS.suspiciousActivity(collegeId, id)).set(payload);
    return id;
};

const maybeLogLogoutSuspicion = async ({ collegeId, studentUid, nowMs, sessionId, deviceId }) => {
    if (!studentUid) return false;
    const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
    const snap = await rtdb().ref(PATHS.securityLogoutLogs(collegeId, studentUid))
        .orderByChild('timestamp_ms')
        .startAt(sevenDaysAgoMs)
        .limitToLast(50)
        .once('value');

    const logs = snap.val() || {};
    const count = Object.values(logs).filter(Boolean).filter((l) => (l.timestamp_ms || 0) >= sevenDaysAgoMs).length;
    if (count <= 3) return false;

    await writeSecuritySuspiciousActivity({
        collegeId,
        activity: {
            type: 'LOW',
            reason: 'FREQUENT_LOGOUT',
            studentId: studentUid,
            deviceId: deviceId || null,
            timestamp: new Date(nowMs).toISOString(),
            timestamp_ms: nowMs,
            resolved: false,
            session_id: sessionId || null,
            details: { logoutCount7d: count }
        }
    });
    await incrementSuspicionScore({ collegeId, studentUid, delta: 1, nowMs });
    return true;
};

const evaluateDeviceSuspicionAfterCommit = async ({ collegeId, studentUid, deviceId, sessionId, nowMs }) => {
    if (!studentUid || !deviceId || !sessionId) return { wrote: false };

    let wroteAny = false;

    // Device binding: first device wins; a switch is suspicious.
    const deviceMapRef = rtdb().ref(PATHS.securityDeviceMap(collegeId, studentUid));
    const deviceMapTx = await deviceMapRef.transaction((current) => {
        if (current === null) return String(deviceId);
        return undefined;
    }, undefined, false);

    if (deviceMapTx?.committed !== true) {
        // If it wasn't committed, we need to check whether this was a switch.
        const existing = deviceMapTx?.snapshot?.val();
        const bound = existing === null ? null : String(existing || '');
        if (bound && bound !== String(deviceId)) {
            await writeSecuritySuspiciousActivity({
                collegeId,
                activity: {
                    type: 'MEDIUM',
                    reason: 'DEVICE_SWITCH',
                    studentId: studentUid,
                    deviceId: String(deviceId),
                    timestamp: new Date(nowMs).toISOString(),
                    timestamp_ms: nowMs,
                    resolved: false,
                    session_id: sessionId
                }
            });
            await incrementSuspicionScore({ collegeId, studentUid, delta: 3, nowMs });
            wroteAny = true;
        }
    }

    // Index device -> students (detect same device used for multiple students)
    const deviceIndexRef = rtdb().ref(`${PATHS.securityDeviceIndex(collegeId, deviceId)}/${studentUid}`);
    await deviceIndexRef.set(true);
    const deviceIndexSnap = await rtdb().ref(PATHS.securityDeviceIndex(collegeId, deviceId)).once('value');
    const deviceIndex = deviceIndexSnap.val() || {};
    const studentIdsOnDevice = Object.keys(deviceIndex).filter(Boolean);
    const multipleStudents = studentIdsOnDevice.filter((id) => id !== studentUid).length > 0;
    if (multipleStudents) {
        await writeSecuritySuspiciousActivity({
            collegeId,
            activity: {
                type: 'HIGH',
                reason: 'DEVICE_SHARED_MULTIPLE_STUDENTS',
                studentId: studentUid,
                deviceId: String(deviceId),
                timestamp: new Date(nowMs).toISOString(),
                timestamp_ms: nowMs,
                resolved: false,
                session_id: sessionId,
                details: { otherStudentCount: studentIdsOnDevice.length - 1 }
            }
        });
        await incrementSuspicionScore({ collegeId, studentUid, delta: 5, nowMs });
        wroteAny = true;
    }

    // Per-session device usage (detect device used for multiple students in the same session)
    await rtdb().ref(`${PATHS.securityDeviceSessionMap(collegeId, sessionId, deviceId)}/${studentUid}`).set(nowMs);
    const sessionDeviceSnap = await rtdb().ref(PATHS.securityDeviceSessionMap(collegeId, sessionId, deviceId)).once('value');
    const sessionDevice = sessionDeviceSnap.val() || {};
    const studentsThisSession = Object.keys(sessionDevice).filter(Boolean);
    const multipleInSession = studentsThisSession.filter((id) => id !== studentUid).length > 0;
    if (multipleInSession) {
        await writeSecuritySuspiciousActivity({
            collegeId,
            activity: {
                type: 'HIGH',
                reason: 'DEVICE_MULTI_ATTENDANCE_SAME_SESSION',
                studentId: studentUid,
                deviceId: String(deviceId),
                timestamp: new Date(nowMs).toISOString(),
                timestamp_ms: nowMs,
                resolved: false,
                session_id: sessionId,
                details: { otherStudentCount: studentsThisSession.length - 1 }
            }
        });
        await incrementSuspicionScore({ collegeId, studentUid, delta: 5, nowMs });
        wroteAny = true;
    }

    return { wrote: wroteAny };
};

const normalizeLocation = (body) => {
    const lat = body.latitude ?? body.lat ?? body.geoLatitude ?? body.geo_latitude ?? body.location?.latitude ?? body.location?.lat;
    const lon = body.longitude ?? body.lng ?? body.geoLongitude ?? body.geo_longitude ?? body.location?.longitude ?? body.location?.lng;
    const acc = body.accuracyMeters ?? body.accuracy_meters ?? body.location?.accuracyMeters ?? body.location?.accuracy_meters;

    const latitude = lat === null || lat === undefined ? null : Number(lat);
    const longitude = lon === null || lon === undefined ? null : Number(lon);
    const accuracyMeters = acc === null || acc === undefined ? null : Number(acc);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { latitude: null, longitude: null, accuracyMeters: null };
    return {
        latitude,
        longitude,
        accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : null
    };
};

exports.validateCode = async (req, res) => {
    try {
        const collegeId = req.user?.collegeId || null;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const code = req.body?.code ?? req.body?.sessionCode ?? req.body?.session_code;
        const resolved = await resolveActiveSessionByCode(collegeId, code);
        if (!resolved) return response.notFound(res, 'Invalid or expired session code');

        const { sessionId, session } = resolved;
        const isActive = session.status === 'active';

        // Expose only what a student client needs to render the check-in screen.
        return response.success(res, {
            valid: true,
            isActive,
            sessionId,
            session: {
                id: session.id || sessionId,
                session_date: session.session_date || null,
                start_time: session.scheduled_start_time || session.start_time || null,
                end_time: session.scheduled_end_time || session.end_time || null,
                class_id: session.class_id || null,
                class_name: session.class_name || null,
                subject_id: session.subject_id || null,
                subject_name: session.subject_name || null,
                require_photo: session.require_photo ?? null,
                require_location: session.require_location ?? null,
                require_wifi: session.require_wifi ?? null,
                geo_latitude: session.geo_latitude ?? null,
                geo_longitude: session.geo_longitude ?? null,
                geo_radius_meters: session.geo_radius_meters ?? null,
                allowed_wifi_ssids: session.allowed_wifi_ssids || []
            },
            codeValidityMinutes: config.session?.codeValidityMinutes ?? null
        });
    } catch (error) {
        console.error('Validate code error:', error);
        return response.serverError(res, 'Failed to validate code');
    }
};

exports.submitAttendance = async (req, res) => {
    const collegeId = req.user?.collegeId || null;
    const studentUid = req.user?.uid || null;

    try {
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);
        if (!studentUid) return response.unauthorized(res, 'Authentication required');

        // Optional fields accepted for client compatibility, but must match auth context.
        const bodyStudentId = req.body?.studentId ?? req.body?.student_id ?? null;
        if (bodyStudentId && String(bodyStudentId) !== String(studentUid)) {
            return response.forbidden(res, 'studentId does not match authenticated user');
        }

        const bodyCollegeId = req.body?.collegeId ?? req.body?.college_id ?? null;
        if (bodyCollegeId && String(bodyCollegeId) !== String(collegeId)) {
            return response.forbidden(res, 'collegeId does not match authenticated user');
        }

        const clientTimestamp = req.body?.timestamp ?? req.body?.marked_at ?? req.body?.markedAt ?? null;

        const code = req.body?.code ?? req.body?.sessionCode ?? req.body?.session_code;
        const sessionIdFromBody = req.body?.sessionId ?? req.body?.session_id ?? null;

        let sessionId = null;
        let session = null;
        let normalizedCode = null;

        if (code) {
            const resolved = await resolveActiveSessionByCode(collegeId, code);
            if (!resolved) return response.notFound(res, 'Invalid or expired session code');
            sessionId = resolved.sessionId;
            session = resolved.session;
            normalizedCode = resolved.code;
        } else if (sessionIdFromBody) {
            if (!isTrustedAttendanceBypass(req)) {
                return response.forbidden(res, 'Session code is required');
            }

            sessionId = String(sessionIdFromBody);
            session = await readVal(PATHS.attendanceSession(collegeId, sessionId));
            if (!session) return response.notFound(res, 'Session not found');
        } else {
            return response.error(res, 'code or sessionId is required', 400);
        }

        const nowMs = Date.now();

        // V2: enforce scheduled end time cutoff, independent of session.status.
        const scheduledEndMs = parseSessionScheduledEndMs(session);
        if (Number.isFinite(scheduledEndMs) && nowMs > scheduledEndMs) {
            await logAttempt({
                collegeId,
                sessionId,
                studentUid,
                success: false,
                reason: 'SESSION_CLOSED',
                data: {
                    code: normalizedCode || (code ? normalizeCode(code) : null),
                    scheduled_end_time: session?.scheduled_end_time || null,
                    client_timestamp: clientTimestamp || null
                }
            });
            return res.status(403).json(buildSessionClosedError());
        }

        if (session.status !== 'active') {
            await logAttempt({
                collegeId,
                sessionId,
                studentUid,
                success: false,
                reason: 'SESSION_NOT_ACTIVE',
                data: {
                    code: normalizedCode || (code ? normalizeCode(code) : null),
                    client_timestamp: clientTimestamp || null
                }
            });
            return response.error(res, 'Session is not active', 400);
        }

        const inClass = await exists(`${PATHS.classStudents(collegeId, session.class_id)}/${studentUid}`);
        if (!inClass) {
            await logAttempt({
                collegeId,
                sessionId,
                studentUid,
                success: false,
                reason: 'STUDENT_NOT_IN_CLASS',
                data: {
                    class_id: session.class_id || null,
                    code: normalizedCode || (code ? normalizeCode(code) : null),
                    client_timestamp: clientTimestamp || null
                }
            });
            return response.forbidden(res, 'You are not enrolled in this class');
        }

        const wifiSsid = req.body?.wifiSsid ?? req.body?.wifi_ssid ?? null;
        const photoUrl = req.body?.photoUrl ?? req.body?.photo_url ?? null;
        const deviceId = req.body?.deviceId ?? req.body?.device_id ?? null;
        const loc = normalizeLocation(req.body || {});

        const requireWifi = session.require_wifi === true;
        const requirePhoto = session.require_photo === true;
        const requireLocation = session.require_location === true;

        const allowedWifiSsids = Array.isArray(session.allowed_wifi_ssids) ? session.allowed_wifi_ssids : [];
        const isWifiAllowed = requireWifi ? Boolean(wifiSsid && allowedWifiSsids.includes(wifiSsid)) : null;

        if (requirePhoto && !photoUrl) {
            await logAttempt({
                collegeId,
                sessionId,
                studentUid,
                success: false,
                reason: 'PHOTO_REQUIRED',
                data: {
                    code: normalizedCode || (code ? normalizeCode(code) : null),
                    client_timestamp: clientTimestamp || null
                }
            });
            return response.error(res, 'Photo is required for this session', 400);
        }

        let isWithinGeofence = null;
        let geofenceDistanceMeters = null;
        let geofenceRadiusMeters = null;
        if (requireLocation) {
            if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) {
                await logAttempt({
                    collegeId,
                    sessionId,
                    studentUid,
                    success: false,
                    reason: 'LOCATION_REQUIRED',
                    data: {
                        code: normalizedCode || (code ? normalizeCode(code) : null),
                        client_timestamp: clientTimestamp || null
                    }
                });
                return response.error(res, 'Location is required for this session', 400);
            }

            const geoLat = Number(session.geo_latitude);
            const geoLon = Number(session.geo_longitude);
            const geoRadius = Number(session.geo_radius_meters);
            if (Number.isFinite(geoLat) && Number.isFinite(geoLon) && Number.isFinite(geoRadius) && geoRadius > 0) {
                geofenceDistanceMeters = haversineDistanceMeters(geoLat, geoLon, loc.latitude, loc.longitude);
                geofenceRadiusMeters = geoRadius;
                isWithinGeofence = geofenceDistanceMeters <= geoRadius;
            }
        }

        const status = computeAttendanceStatus(session, nowMs);

        const recordPath = PATHS.attendanceRecord(collegeId, sessionId, studentUid);
        const recordRef = rtdb().ref(recordPath);

        const flagReasons = [];
        if (requireWifi && isWifiAllowed === false) flagReasons.push('WIFI_NOT_ALLOWED');
        if (requireLocation && isWithinGeofence === false) flagReasons.push('OUTSIDE_GEOFENCE');

        const isFlagged = flagReasons.length > 0;
        const verificationStatus = isFlagged ? 'flagged' : 'verified';
        const flagPayload = isFlagged
            ? {
                reasons: flagReasons,
                wifi_ssid: wifiSsid || null,
                is_wifi_allowed: isWifiAllowed,
                is_within_geofence: isWithinGeofence,
                distance_meters: Number.isFinite(geofenceDistanceMeters) ? geofenceDistanceMeters : null,
                radius_meters: Number.isFinite(geofenceRadiusMeters) ? geofenceRadiusMeters : null,
                created_at_ms: nowMs
            }
            : null;

        const recordId = uuidv4();
        const markedAtIso = new Date(nowMs).toISOString();

        const transactionResult = await recordRef.transaction((current) => {
            if (current?.manual_override === true) return;
            if (['present', 'late', 'excused'].includes(current?.status)) return;

            const next = {
                ...(current || {}),
                id: current?.id || recordId,
                session_id: current?.session_id || sessionId,
                student_id: current?.student_id || studentUid,
                status: status,
                verification_status: verificationStatus,
                marked_at: markedAtIso,
                marked_at_ms: nowMs,
                is_within_geofence: isWithinGeofence,
                wifi_ssid: wifiSsid || null,
                photo_url: photoUrl || null,
                device_id: deviceId || null,
                latitude: Number.isFinite(loc.latitude) ? loc.latitude : null,
                longitude: Number.isFinite(loc.longitude) ? loc.longitude : null,
                location_accuracy_meters: Number.isFinite(loc.accuracyMeters) ? loc.accuracyMeters : null,
                flag: flagPayload,
                updated_at_ms: nowMs,
                created_at_ms: current?.created_at_ms || nowMs,
                manual_override: current?.manual_override === true
            };

            return next;
        });

        const committed = transactionResult?.committed === true;

        let wroteSuspiciousActivity = false;

        if (committed && isFlagged) {
            try {
                const activityId = uuidv4();
                await writeSecuritySuspiciousActivity({
                    collegeId,
                    activity: {
                        id: activityId,
                        type: 'MEDIUM',
                        reason: `ATTENDANCE_FLAGGED:${flagReasons.join(',')}`,
                        studentId: studentUid,
                        deviceId: deviceId || null,
                        timestamp: new Date(nowMs).toISOString(),
                        timestamp_ms: nowMs,
                        resolved: false,
                        session_id: sessionId,
                        class_id: session.class_id || null,
                        subject_id: session.subject_id || null,
                        code: normalizedCode || (code ? normalizeCode(code) : null),
                        details: flagPayload
                    }
                });
                wroteSuspiciousActivity = true;
            } catch (e) {
                console.error('Failed to write suspicious activity:', e);
            }
        }

        if (committed) {
            try {
                const deviceSuspicion = await evaluateDeviceSuspicionAfterCommit({
                    collegeId,
                    studentUid,
                    deviceId,
                    sessionId,
                    nowMs
                });
                const logoutSuspicion = await maybeLogLogoutSuspicion({ collegeId, studentUid, nowMs, sessionId, deviceId });
                wroteSuspiciousActivity = wroteSuspiciousActivity || deviceSuspicion.wrote || logoutSuspicion;
            } catch (e) {
                console.warn('Suspicion engine failed (best-effort):', e);
            }

            try {
                await updateSessionStatsAfterCommit({
                    collegeId,
                    sessionId,
                    status,
                    verificationStatus,
                    wroteSuspiciousActivity,
                    nowMs
                });
            } catch (e) {
                console.warn('Failed to update session stats (best-effort):', e);
            }

            await logAttempt({
                collegeId,
                sessionId,
                studentUid,
                success: true,
                reason: isFlagged ? 'MARKED_FLAGGED' : 'MARKED',
                data: {
                    code: normalizedCode || (code ? normalizeCode(code) : null),
                    submitted_status: status,
                    wifi_ssid: wifiSsid || null,
                    is_within_geofence: isWithinGeofence,
                    is_wifi_allowed: isWifiAllowed,
                    photo_url: photoUrl || null,
                    device_id: deviceId || null,
                    client_timestamp: clientTimestamp || null
                }
            });

            await req.audit('SUBMIT_ATTENDANCE', 'attendance_record', sessionId, null, { studentUid, status, sessionId });
        }

        return response.success(res, {
            sessionId,
            status,
            alreadyMarked: committed !== true
        }, committed ? 'Attendance marked' : 'Attendance already submitted');
    } catch (error) {
        console.error('Submit attendance error:', error);
        return response.serverError(res, 'Failed to submit attendance');
    }
};
