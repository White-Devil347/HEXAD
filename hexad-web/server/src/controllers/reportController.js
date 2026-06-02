const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { rtdb } = require('../firebase/firebase');
const { response } = require('../utils');

const PATHS = {
    teacherSessions: (collegeId, teacherUid) => `colleges/${collegeId}/teacher_sessions/${teacherUid}`,
    attendanceSession: (collegeId, sessionId) => `colleges/${collegeId}/sessions/${sessionId}`,
    attendanceRecords: (collegeId, sessionId) => `colleges/${collegeId}/attendance_records/${sessionId}`,
    classStudents: (collegeId, classId) => `colleges/${collegeId}/classes/${classId}/students`,
    studentInfo: (collegeId, studentUid) => `colleges/${collegeId}/students/${studentUid}/info`,
    monthlyReports: (collegeId, year, month) => `colleges/${collegeId}/reports/${year}/${String(month).padStart(2, '0')}`
};

const readVal = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.val();
};

const getTeacherSessions = async (collegeId, teacherUid) => {
    const index = await readVal(PATHS.teacherSessions(collegeId, teacherUid)) || {};
    const sessionIds = Object.keys(index);
    const sessions = await Promise.all(sessionIds.map((id) => readVal(PATHS.attendanceSession(collegeId, id))));
    return sessions.filter(Boolean);
};

const filterSessions = (sessions, { sessionId, classId, subjectId, dateFrom, dateTo }) => {
    let list = sessions;
    if (sessionId) list = list.filter((s) => s.id === sessionId);
    if (classId) list = list.filter((s) => s.class_id === classId);
    if (subjectId) list = list.filter((s) => s.subject_id === subjectId);
    if (dateFrom) list = list.filter((s) => (s.session_date || '') >= dateFrom);
    if (dateTo) list = list.filter((s) => (s.session_date || '') <= dateTo);
    return list;
};

const buildRowsForSessions = async (collegeId, sessions) => {
    // For each session, join student roster + record status
    const allRows = [];

    for (const s of sessions) {
        const [studentsIndex, recordsMap] = await Promise.all([
            readVal(PATHS.classStudents(collegeId, s.class_id)),
            readVal(PATHS.attendanceRecords(collegeId, s.id))
        ]);

        const studentIds = Object.keys(studentsIndex || {});
        const infos = await Promise.all(studentIds.map((uid) => readVal(PATHS.studentInfo(collegeId, uid))));

        studentIds.forEach((studentId, idx) => {
            const info = infos[idx] || {};
            const rec = recordsMap?.[studentId] || null;
            const status = rec?.status || 'absent';
            allRows.push({
                session_id: s.id,
                session_date: s.session_date || null,
                class_name: s.class_name || null,
                subject_name: s.subject_name || null,
                teacher_uid: s.teacher_uid || null,
                student_id: studentId,
                roll_number: info.rollNumber || info.roll_number || null,
                first_name: info.firstName || info.first_name || null,
                last_name: info.lastName || info.last_name || null,
                status,
                verification_status: rec?.verification_status || 'verified',
                marked_at: rec?.marked_at || null,
                manual_override: rec?.manual_override || false
            });
        });
    }

    // Stable sort: date, class, roll
    allRows.sort((a, b) => {
        if (a.session_date !== b.session_date) return String(a.session_date || '').localeCompare(String(b.session_date || ''));
        if (a.class_name !== b.class_name) return String(a.class_name || '').localeCompare(String(b.class_name || ''));
        return String(a.roll_number || '').localeCompare(String(b.roll_number || ''));
    });

    return allRows;
};

exports.exportToExcel = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const teacherUid = req.user.uid;
        if (!collegeId) return response.error(res, 'Missing collegeId on user profile', 400);

        const q = req.query || {};
        const normalized = {
            sessionId: q.sessionId || q.session_id || null,
            classId: q.classId || q.class_id || null,
            subjectId: q.subjectId || q.subject_id || null,
            dateFrom: q.dateFrom || q.start_date || q.startDate || null,
            dateTo: q.dateTo || q.end_date || q.endDate || null
        };

        const sessions = filterSessions(await getTeacherSessions(collegeId, teacherUid), {
            sessionId: normalized.sessionId,
            classId: normalized.classId,
            subjectId: normalized.subjectId,
            dateFrom: normalized.dateFrom,
            dateTo: normalized.dateTo
        });

        const rows = await buildRowsForSessions(collegeId, sessions);

        const sheet = XLSX.utils.json_to_sheet(rows, {
            header: [
                'session_id',
                'session_date',
                'class_name',
                'subject_name',
                'teacher_uid',
                'student_id',
                'roll_number',
                'first_name',
                'last_name',
                'status',
                'verification_status',
                'marked_at',
                'manual_override'
            ]
        });

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=attendance_report.xlsx');
        return res.send(buffer);
    } catch (error) {
        console.error('Export Excel error:', error);
        return response.serverError(res, 'Failed to export report');
    }
};

exports.exportToPDF = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const teacherUid = req.user.uid;
        if (!collegeId) return response.error(res, 'Missing collegeId on user profile', 400);

        const q = req.query || {};
        const normalized = {
            sessionId: q.sessionId || q.session_id || null,
            classId: q.classId || q.class_id || null,
            subjectId: q.subjectId || q.subject_id || null,
            dateFrom: q.dateFrom || q.start_date || q.startDate || null,
            dateTo: q.dateTo || q.end_date || q.endDate || null
        };

        const sessions = filterSessions(await getTeacherSessions(collegeId, teacherUid), {
            sessionId: normalized.sessionId,
            classId: normalized.classId,
            subjectId: normalized.subjectId,
            dateFrom: normalized.dateFrom,
            dateTo: normalized.dateTo
        });

        const rows = await buildRowsForSessions(collegeId, sessions);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=attendance_report.pdf');

        const doc = new PDFDocument({ margin: 36, size: 'A4' });
        doc.pipe(res);

        doc.fontSize(18).text('Attendance Report', { align: 'center' });
        doc.moveDown();

        doc.fontSize(10);
        const headers = ['Date', 'Class', 'Subject', 'Roll', 'Name', 'Status'];
        doc.text(headers.join(' | '));
        doc.moveDown(0.5);

        rows.slice(0, 2000).forEach((r) => {
            const name = `${r.first_name || ''} ${r.last_name || ''}`.trim();
            doc.text(`${r.session_date || ''} | ${r.class_name || ''} | ${r.subject_name || ''} | ${r.roll_number || ''} | ${name} | ${r.status}`);
        });

        if (rows.length > 2000) {
            doc.moveDown();
            doc.text(`(Truncated to first 2000 rows; total rows: ${rows.length})`);
        }

        doc.end();
    } catch (error) {
        console.error('Export PDF error:', error);
        return response.serverError(res, 'Failed to export report');
    }
};

exports.generateMonthlyReport = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        const teacherUid = req.user.uid;
        if (!collegeId) return response.error(res, 'Missing collegeId on user profile', 400);

        const now = new Date();
        const month = Number(req.query.month || (now.getMonth() + 1));
        const year = Number(req.query.year || now.getFullYear());
        const classId = req.query.classId || req.query.class_id;

        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        const end = `${year}-${String(month).padStart(2, '0')}-31`;

        const sessions = filterSessions(await getTeacherSessions(collegeId, teacherUid), {
            classId,
            dateFrom: start,
            dateTo: end
        });

        const rows = await buildRowsForSessions(collegeId, sessions);

        const totals = { present: 0, late: 0, absent: 0, excused: 0, total: rows.length };
        rows.forEach((r) => {
            if (r.status === 'present') totals.present += 1;
            else if (r.status === 'late') totals.late += 1;
            else if (r.status === 'excused') totals.excused += 1;
            else totals.absent += 1;
        });

        const report = {
            month,
            year,
            classId: classId || null,
            generated_at_ms: Date.now(),
            session_count: sessions.length,
            totals,
            attendanceRate: totals.total ? Math.round(((totals.present + totals.late) / totals.total) * 100) : 0
        };

        await rtdb().ref(`${PATHS.monthlyReports(collegeId, year, month)}/monthly_${teacherUid}`).set(report);

        return response.success(res, report, 'Monthly report generated');
    } catch (error) {
        console.error('Generate monthly report error:', error);
        return response.serverError(res, 'Failed to generate monthly report');
    }
};
