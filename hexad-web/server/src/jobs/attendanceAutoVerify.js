const { rtdb } = require('../firebase/firebase');

const AUTO_VERIFY_AFTER_MS = 6 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

const readVal = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.val();
};

const isSessionEligible = (session, nowMs) => {
    if (!session) return false;
    if (session.status !== 'completed' && session.status !== 'ended') return false;

    const endedAtMs = session.ended_at ? Date.parse(session.ended_at) : NaN;
    if (!Number.isFinite(endedAtMs)) return false;

    // Only process sessions that ended more than 6 hours ago.
    if (endedAtMs > nowMs - AUTO_VERIFY_AFTER_MS) return false;

    // Best-effort idempotency marker.
    const processedAtMs = Number(session.auto_verify_processed_at_ms);
    if (Number.isFinite(processedAtMs) && processedAtMs >= endedAtMs) return false;

    return true;
};

const buildAttendanceUpdates = ({ collegeId, sessionId, recordsMap, nowMs }) => {
    const updates = {};
    let updatedCount = 0;

    for (const [studentUid, rec] of Object.entries(recordsMap || {})) {
        if (studentUid === 'meta') continue;
        if (!rec) continue;

        if (rec.manual_override === true) continue;
        if (rec.status !== 'absent') continue;
        if (rec.verification_status !== 'unverified') continue;

        const base = `colleges/${collegeId}/attendance_records/${sessionId}/${studentUid}`;
        updates[`${base}/verification_status`] = 'verified';
        updates[`${base}/auto_verified_at_ms`] = nowMs;
        updates[`${base}/updated_at_ms`] = nowMs;
        updatedCount++;
    }

    return { updates, updatedCount };
};

const autoVerifyCollegeOnce = async (collegeId) => {
    const nowMs = Date.now();

    const sessions = await readVal(`colleges/${collegeId}/sessions`) || {};
    const eligibleSessions = Object.entries(sessions)
        .map(([id, s]) => ({ sessionId: id, session: s }))
        .filter(({ session }) => isSessionEligible(session, nowMs));

    for (const { sessionId } of eligibleSessions) {
        const sessionRef = rtdb().ref(`colleges/${collegeId}/sessions/${sessionId}`);

        const recordsPath = `colleges/${collegeId}/attendance_records/${sessionId}`;
        const recordsMap = await readVal(recordsPath) || {};

        const { updates, updatedCount } = buildAttendanceUpdates({ collegeId, sessionId, recordsMap, nowMs });
        if (Object.keys(updates).length > 0) {
            await rtdb().ref().update(updates);
        }

        // Mark as processed even if there were no eligible records, to avoid scanning repeatedly.
        await sessionRef.update({
            auto_verify_processed_at_ms: nowMs,
            auto_verify_processed_count: updatedCount,
            auto_verify_processed_at: new Date(nowMs).toISOString()
        });
    }

    return { eligibleSessions: eligibleSessions.length };
};

const autoVerifyAllCollegesOnce = async () => {
    const colleges = await readVal('colleges') || {};
    const collegeIds = Object.keys(colleges);

    const results = { colleges: collegeIds.length, eligibleSessions: 0 };
    for (const collegeId of collegeIds) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const r = await autoVerifyCollegeOnce(collegeId);
            results.eligibleSessions += r.eligibleSessions;
        } catch (e) {
            console.error(`Auto-verify failed for college ${collegeId}:`, e);
        }
    }

    return results;
};

exports.startAttendanceAutoVerifyJob = () => {
    const enabled = String(process.env.ENABLE_ATTENDANCE_AUTO_VERIFY || 'true').toLowerCase() !== 'false';
    if (!enabled) {
        console.log('ℹ️ Attendance auto-verify job disabled (ENABLE_ATTENDANCE_AUTO_VERIFY=false)');
        return null;
    }

    const intervalMinutes = Number(process.env.ATTENDANCE_AUTO_VERIFY_INTERVAL_MINUTES);
    const intervalMs = Number.isFinite(intervalMinutes) && intervalMinutes > 0
        ? intervalMinutes * 60 * 1000
        : DEFAULT_INTERVAL_MS;

    let running = false;

    const runOnce = async () => {
        if (running) return;
        running = true;
        try {
            const r = await autoVerifyAllCollegesOnce();
            if (r.eligibleSessions > 0) {
                console.log(`✅ Auto-verify processed completed sessions: ${r.eligibleSessions}`);
            }
        } catch (e) {
            console.error('Auto-verify job run failed:', e);
        } finally {
            running = false;
        }
    };

    // Kick off shortly after startup.
    setTimeout(runOnce, 5000);

    const intervalId = setInterval(runOnce, intervalMs);
    console.log(`🕒 Attendance auto-verify job scheduled every ${Math.round(intervalMs / 60000)} minutes`);

    return intervalId;
};
