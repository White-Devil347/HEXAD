const { rtdb } = require('../firebase/firebase');
const { response } = require('../utils');

const PATHS = {
    teacherSessions: (collegeId, teacherUid) => `colleges/${collegeId}/teacher_sessions/${teacherUid}`,
    attendanceSession: (collegeId, sessionId) => `colleges/${collegeId}/sessions/${sessionId}`,
    attendanceRecords: (collegeId, sessionId) => `colleges/${collegeId}/attendance_records/${sessionId}`,
    classStudents: (collegeId, classId) => `colleges/${collegeId}/classes/${classId}/students`,
    studentInfo: (collegeId, studentUid) => `colleges/${collegeId}/students/${studentUid}/info`,
    analyticsCache: (collegeId) => `colleges/${collegeId}/analytics_cache`
};

const readVal = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.val();
};

const countStatus = (recordsObj) => {
    const vals = Object.values(recordsObj || {});
    const present = vals.filter((r) => r?.status === 'present').length;
    const late = vals.filter((r) => r?.status === 'late').length;
    const absent = vals.filter((r) => !r || r.status === 'absent').length;
    const excused = vals.filter((r) => r?.status === 'excused').length;
    const total = vals.length;
    return { total, present, late, absent, excused };
};

const withinPeriod = (isoDateOrYmd, period) => {
    if (!period) return true;
    const now = new Date();
    const d = new Date(isoDateOrYmd);
    if (Number.isNaN(d.getTime())) {
        // try YYYY-MM-DD
        if (typeof isoDateOrYmd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(isoDateOrYmd)) {
            const [y, m, day] = isoDateOrYmd.split('-').map(Number);
            const dt = new Date(y, m - 1, day);
            if (Number.isNaN(dt.getTime())) return true;
            return withinPeriod(dt.toISOString(), period);
        }
        return true;
    }

    const ms = now.getTime() - d.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    if (period === 'today') return ms >= 0 && ms < dayMs;
    if (period === 'week') return ms >= 0 && ms < 7 * dayMs;
    if (period === 'month') return ms >= 0 && ms < 31 * dayMs;
    if (period === 'semester') return ms >= 0 && ms < 183 * dayMs;
    if (period === 'year') return ms >= 0 && ms < 366 * dayMs;
    return true;
};

const normalizeQuery = (req) => {
    const q = req.query || {};
    return {
        period: q.period || 'month',
        classId: q.classId || q.class_id || null,
        subjectId: q.subjectId || q.subject_id || null
    };
};

const buildLegacySummary = (overallStats) => {
    const totalSessions = overallStats?.totalSessions ?? 0;
    const totalRecords = overallStats?.totalRecords ?? 0;
    const presentCount = (overallStats?.present ?? 0) + (overallStats?.late ?? 0);
    const attendancePercentage = overallStats?.attendanceRate ?? 0;
    return { totalSessions, totalRecords, presentCount, attendancePercentage };
};

const buildLegacyDailyTrend = (dailyTrend) => {
    return (dailyTrend || []).map((d) => {
        const presentOrLate = (d.present || 0) + (d.late || 0);
        const total = presentOrLate + (d.absent || 0);
        return {
            date: d.date,
            present_count: presentOrLate,
            absent_count: d.absent || 0,
            sessions: d.sessions || 0,
            percentage: total ? Math.round((presentOrLate / total) * 100) : 0
        };
    });
};

const buildLegacyStatusDistribution = (overallStats) => {
    const items = [
        { status: 'present', count: overallStats?.present ?? 0 },
        { status: 'late', count: overallStats?.late ?? 0 },
        { status: 'absent', count: overallStats?.absent ?? 0 },
        { status: 'excused', count: overallStats?.excused ?? 0 }
    ];
    return items.filter((i) => Number(i.count) > 0);
};

const buildLegacyVerificationStats = (verificationMap) => {
    const map = verificationMap || {};
    return Object.entries(map).map(([verification_status, count]) => ({
        verification_status,
        count
    }));
};

const getTeacherSessionIds = async (collegeId, teacherUid) => {
    const index = await readVal(PATHS.teacherSessions(collegeId, teacherUid)) || {};
    return Object.keys(index);
};

const getTeacherSessions = async (collegeId, teacherUid) => {
    const sessionIds = await getTeacherSessionIds(collegeId, teacherUid);
    const sessions = await Promise.all(sessionIds.map((id) => readVal(PATHS.attendanceSession(collegeId, id))));
    return sessions.filter(Boolean);
};

exports.getAttendanceAnalytics = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const teacherUid = req.user.uid;
        if (!collegeId) return response.error(res, 'Missing collegeId on user profile', 400);

        const { period, classId, subjectId } = normalizeQuery(req);

        const sessions = (await getTeacherSessions(collegeId, teacherUid))
            .filter((s) => withinPeriod(s.session_date || s.created_at || s.started_at, period))
            .filter((s) => (classId ? s.class_id === classId : true))
            .filter((s) => (subjectId ? s.subject_id === subjectId : true));

        const recordsList = await Promise.all(sessions.map((s) => readVal(PATHS.attendanceRecords(collegeId, s.id))));

        const totals = { sessions: sessions.length, present: 0, late: 0, absent: 0, excused: 0, records: 0 };
        const dailyTrendMap = {};
        const classMap = {};
        const subjectMap = {};
        const weekdayMap = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
        const verificationMap = { verified: 0, unverified: 0, manual: 0 };

        sessions.forEach((s, idx) => {
            const recs = recordsList[idx] || {};
            const vals = Object.values(recs);
            const counts = countStatus(recs);

            totals.present += counts.present;
            totals.late += counts.late;
            totals.absent += counts.absent;
            totals.excused += counts.excused;
            totals.records += counts.total;

            const dateKey = s.session_date || (s.created_at ? String(s.created_at).slice(0, 10) : 'unknown');
            dailyTrendMap[dateKey] = dailyTrendMap[dateKey] || { date: dateKey, sessions: 0, present: 0, late: 0, absent: 0 };
            dailyTrendMap[dateKey].sessions += 1;
            dailyTrendMap[dateKey].present += counts.present;
            dailyTrendMap[dateKey].late += counts.late;
            dailyTrendMap[dateKey].absent += counts.absent;

            const cls = s.class_id || 'unknown';
            classMap[cls] = classMap[cls] || { classId: cls, className: s.class_name || null, sessions: 0, present: 0, records: 0 };
            classMap[cls].sessions += 1;
            classMap[cls].present += counts.present + counts.late;
            classMap[cls].records += counts.total;

            const subj = s.subject_id || 'unknown';
            subjectMap[subj] = subjectMap[subj] || { subjectId: subj, subjectName: s.subject_name || null, sessions: 0, present: 0, records: 0 };
            subjectMap[subj].sessions += 1;
            subjectMap[subj].present += counts.present + counts.late;
            subjectMap[subj].records += counts.total;

            const day = new Date(dateKey).toString().slice(0, 3);
            if (weekdayMap[day] !== undefined) weekdayMap[day] += 1;

            vals.forEach((r) => {
                const vs = r?.verification_status || 'verified';
                if (verificationMap[vs] === undefined) verificationMap[vs] = 0;
                verificationMap[vs] += 1;
            });
        });

        const dailyTrend = Object.values(dailyTrendMap).sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const classBreakdown = Object.values(classMap).map((c) => ({
            ...c,
            attendanceRate: c.records ? Math.round((c.present / c.records) * 100) : 0
        }));
        const subjectBreakdown = Object.values(subjectMap).map((s) => ({
            ...s,
            attendanceRate: s.records ? Math.round((s.present / s.records) * 100) : 0
        }));

        const overallStats = {
            totalSessions: totals.sessions,
            totalRecords: totals.records,
            present: totals.present,
            late: totals.late,
            absent: totals.absent,
            excused: totals.excused,
            attendanceRate: totals.records ? Math.round(((totals.present + totals.late) / totals.records) * 100) : 0
        };

        return response.success(res, {
            // Legacy shape used by current teacher UI + docs
            summary: buildLegacySummary(overallStats),
            dailyTrend: buildLegacyDailyTrend(dailyTrend),
            statusDistribution: buildLegacyStatusDistribution(overallStats),
            verificationStats: buildLegacyVerificationStats(verificationMap),

            // Keep richer shape for newer callers
            overallStats,
            classBreakdown,
            subjectBreakdown,
            weekdayDistribution: weekdayMap,
            verificationStatsMap: verificationMap
        });
    } catch (error) {
        console.error('Get attendance analytics error:', error);
        return response.serverError(res, 'Failed to fetch analytics');
    }
};

exports.getStudentAnalytics = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const teacherUid = req.user.uid;
        if (!collegeId) return response.error(res, 'Missing collegeId on user profile', 400);

        const { period, classId, subjectId } = normalizeQuery(req);
        const sessions = (await getTeacherSessions(collegeId, teacherUid))
            .filter((s) => withinPeriod(s.session_date || s.created_at || s.started_at, period))
            .filter((s) => (classId ? s.class_id === classId : true))
            .filter((s) => (subjectId ? s.subject_id === subjectId : true));

        // Build class -> student list
        const classIds = [...new Set(sessions.map((s) => s.class_id).filter(Boolean))];
        const classStudents = await Promise.all(classIds.map((cid) => readVal(PATHS.classStudents(collegeId, cid))));
        const allStudentIds = [...new Set(classStudents.flatMap((idx) => Object.keys(idx || {})))];
        const studentInfos = await Promise.all(allStudentIds.map((uid) => readVal(PATHS.studentInfo(collegeId, uid))));
        const studentInfoMap = Object.fromEntries(allStudentIds.map((uid, i) => [uid, studentInfos[i] || {}]));

        const statsMap = Object.fromEntries(allStudentIds.map((uid) => {
            const roll = studentInfoMap[uid].rollNumber || studentInfoMap[uid].roll_number || null;
            const first = studentInfoMap[uid].firstName || studentInfoMap[uid].first_name || '';
            const last = studentInfoMap[uid].lastName || studentInfoMap[uid].last_name || '';
            const name = `${first} ${last}`.trim();
            return [uid, {
                student_id: uid,
                roll_number: roll,
                student_name: name,
                total_sessions: 0,
                present_count: 0,
                late_count: 0,
                absent_count: 0,
                excused_count: 0
            }];
        }));

        // For each session, read records once and update stats
        const recordsList = await Promise.all(sessions.map((s) => readVal(PATHS.attendanceRecords(collegeId, s.id))));
        sessions.forEach((s, idx) => {
            const records = recordsList[idx] || {};
            const studentIdsInClass = Object.keys((classStudents[classIds.indexOf(s.class_id)] || {}) || {});
            studentIdsInClass.forEach((studentId) => {
                if (!statsMap[studentId]) return;
                statsMap[studentId].total_sessions += 1;
                const rec = records[studentId];
                const st = rec?.status || 'absent';
                if (st === 'present') statsMap[studentId].present_count += 1;
                else if (st === 'late') statsMap[studentId].late_count += 1;
                else if (st === 'excused') statsMap[studentId].excused_count += 1;
                else statsMap[studentId].absent_count += 1;
            });
        });

        const students = Object.values(statsMap)
            .map((s) => {
                const presentOrLate = (s.present_count || 0) + (s.late_count || 0);
                const total = s.total_sessions || 0;
                return {
                    ...s,
                    attendance_percentage: total ? Math.round((presentOrLate / total) * 1000) / 10 : 0
                };
            })
            .sort((a, b) => (b.attendance_percentage || 0) - (a.attendance_percentage || 0));

        // Legacy teacher UI expects array
        return response.success(res, students);
    } catch (error) {
        console.error('Get student analytics error:', error);
        return response.serverError(res, 'Failed to fetch student analytics');
    }
};

exports.getInsights = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const teacherUid = req.user.uid;
        if (!collegeId) return response.error(res, 'Missing collegeId on user profile', 400);

        const q = req.query || {};
        const period = q.period || 'month';
        const classId = q.classId || q.class_id || null;

        const sessions = (await getTeacherSessions(collegeId, teacherUid))
            .filter((s) => withinPeriod(s.session_date || s.created_at || s.started_at, period))
            .filter((s) => (classId ? s.class_id === classId : true));

        // Simple heuristics: identify low-attendance sessions and frequent absences
        const recordsList = await Promise.all(sessions.map((s) => readVal(PATHS.attendanceRecords(collegeId, s.id))));

        const lowAttendanceSessions = [];
        let totalAttendanceRateSum = 0;
        let totalSessionsCounted = 0;

        sessions.forEach((s, idx) => {
            const recs = recordsList[idx] || {};
            const vals = Object.values(recs || {});
            const presentOrLate = vals.filter((r) => r?.status === 'present' || r?.status === 'late').length;
            const total = vals.length || 0;
            const rate = total ? Math.round((presentOrLate / total) * 100) : 0;
            if (total) {
                totalAttendanceRateSum += rate;
                totalSessionsCounted += 1;
            }
            if (total >= 5 && rate < 60) {
                lowAttendanceSessions.push({
                    sessionId: s.id,
                    sessionDate: s.session_date,
                    className: s.class_name || null,
                    subjectName: s.subject_name || null,
                    attendanceRate: rate
                });
            }
        });

        const avgAttendanceRate = totalSessionsCounted ? Math.round(totalAttendanceRateSum / totalSessionsCounted) : 0;

        const lowList = lowAttendanceSessions.sort((a, b) => (a.attendanceRate || 0) - (b.attendanceRate || 0)).slice(0, 10);
        const insights = [];
        if (avgAttendanceRate < 70) {
            insights.push({ type: 'warning', message: 'Attendance looks below target for this period.' });
        } else {
            insights.push({ type: 'positive', message: 'Attendance looks healthy for this period.' });
        }
        if (lowList.length > 0) {
            insights.push({ type: 'alert', message: `${lowList.length} session(s) had low attendance (< 60%).` });
        }

        return response.success(res, {
            // Legacy UI shape
            insights,

            // Extra detail
            averageAttendanceRate: avgAttendanceRate,
            lowAttendanceSessions: lowList
        });
    } catch (error) {
        console.error('Get insights error:', error);
        return response.serverError(res, 'Failed to fetch insights');
    }
};

exports.getHeatmapData = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const teacherUid = req.user.uid;
        if (!collegeId) return response.error(res, 'Missing collegeId on user profile', 400);

        const q = req.query || {};
        const period = q.period || 'month';
        const classId = q.classId || q.class_id || null;
        const sessions = (await getTeacherSessions(collegeId, teacherUid))
            .filter((s) => withinPeriod(s.session_date || s.created_at || s.started_at, period))
            .filter((s) => (classId ? s.class_id === classId : true));

        const recordsList = await Promise.all(sessions.map((s) => readVal(PATHS.attendanceRecords(collegeId, s.id))));

        const dayTotals = {
            Mon: { presentOrLate: 0, total: 0 },
            Tue: { presentOrLate: 0, total: 0 },
            Wed: { presentOrLate: 0, total: 0 },
            Thu: { presentOrLate: 0, total: 0 },
            Fri: { presentOrLate: 0, total: 0 },
            Sat: { presentOrLate: 0, total: 0 }
        };

        sessions.forEach((s, idx) => {
            const dateKey = s.session_date || (s.created_at ? String(s.created_at).slice(0, 10) : null);
            if (!dateKey) return;
            const day = new Date(dateKey).toString().slice(0, 3);
            if (!dayTotals[day]) return;

            const recs = recordsList[idx] || {};
            const vals = Object.values(recs || {});
            const presentOrLate = vals.filter((r) => r?.status === 'present' || r?.status === 'late').length;
            const total = vals.length;
            dayTotals[day].presentOrLate += presentOrLate;
            dayTotals[day].total += total;
        });

        const weeklyPattern = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => {
            const t = dayTotals[day];
            const pct = t.total ? Math.round((t.presentOrLate / t.total) * 1000) / 10 : 0;
            return { day_of_week: day, attendance_percentage: pct };
        });

        // Legacy UI expects an array
        return response.success(res, weeklyPattern);
    } catch (error) {
        console.error('Get heatmap error:', error);
        return response.serverError(res, 'Failed to fetch heatmap');
    }
};
