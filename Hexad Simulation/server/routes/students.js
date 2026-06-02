const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const { generateStudents } = require('../utils/generateStudents');
const apiClient = require('../utils/api-client');

function withDerivedNames(studentDoc) {
  const student = studentDoc?.toObject ? studentDoc.toObject() : { ...studentDoc };
  if (student && (!student.firstName || !student.lastName)) {
    const parts = String(student.name || '').trim().split(/\s+/).filter(Boolean);
    const derivedFirst = parts[0] || null;
    const derivedLast = parts.length > 1 ? parts.slice(1).join(' ') : null;
    return {
      ...student,
      firstName: student.firstName || derivedFirst,
      lastName: student.lastName || derivedLast,
    };
  }
  return student;
}

function extractEnrollmentRecords(payload) {
  const candidates = [
    payload?.students,
    payload?.enrolledStudents,
    payload?.data?.students,
    payload?.data?.enrolledStudents,
    payload?.session?.students,
    payload?.data?.session?.students,
    payload?.data?.sessionDetails?.students,
    payload?.data?.attendanceStudents,
  ].filter((arr) => Array.isArray(arr));

  const inferred = [];
  if (candidates.length === 0) {
    const stack = [payload];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        if (node.length > 0 && typeof node[0] === 'object') {
          const sample = node[0] || {};
          const keys = Object.keys(sample).map((k) => k.toLowerCase());
          const looksLikeRoster = keys.some((k) => k.includes('email')) && keys.some((k) => k.includes('id'));
          if (looksLikeRoster) {
            candidates.push(node);
          }
        }
        continue;
      }
      for (const value of Object.values(node)) {
        if (value && typeof value === 'object') stack.push(value);
      }
    }
  }

  const rows = candidates.flat();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const email =
      row.email ||
      row.studentEmail ||
      row.userEmail ||
      row.contactEmail ||
      row?.student?.email ||
      row?.user?.email ||
      null;

    const hexadStudentId =
      row.officialStudentId ||
      row.studentId ||
      row.hexadStudentId ||
      row.id ||
      row._id ||
      row.userId ||
      row?.student?.studentId ||
      row?.student?.id ||
      row?.student?._id ||
      row?.user?.id ||
      row?.user?._id ||
      null;

    if (email && hexadStudentId) {
      inferred.push({
        email: String(email).toLowerCase().trim(),
        hexadStudentId: String(hexadStudentId).trim(),
      });
    }
  }

  // dedupe by email (keep first)
  const dedup = new Map();
  for (const item of inferred) {
    if (!dedup.has(item.email)) dedup.set(item.email, item);
  }
  return Array.from(dedup.values());
}

// POST: Generate and store bulk students
router.post('/generate', async (req, res) => {
  try {
    const { count, prefix, startingNumber, domain } = req.body;

    // Validation
    if (!count || count < 1 || count > 10000) {
      return res.status(400).json({ error: 'Count must be between 1 and 10000' });
    }
    const normalizedPrefix = String(prefix || '').toUpperCase();
    if (normalizedPrefix !== 'STD-') {
      return res.status(400).json({ error: "Student ID must match STD-001 format (prefix must be 'STD-')" });
    }
    if (!domain || !domain.includes('.')) {
      return res.status(400).json({ error: 'Invalid domain' });
    }

    const startNum = parseInt(startingNumber || 1, 10);
    if (!Number.isFinite(startNum) || startNum < 1 || startNum > 999) {
      return res.status(400).json({ error: 'Starting number must be between 1 and 999' });
    }
    const endNum = startNum + count - 1;
    if (endNum > 999) {
      return res.status(400).json({ error: 'Student ID range exceeds STD-999 (3 digits). Reduce count or starting number.' });
    }

    const students = generateStudents(count, normalizedPrefix, startNum, domain);

    // Insert all students
    const inserted = await Student.insertMany(students);

    res.json({
      success: true,
      count: inserted.length,
      students: inserted,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Duplicate student IDs. Clear existing students first.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// GET: Fetch all students
router.get('/', async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.json({ students: students.map(withDerivedNames), count: students.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Auto-sync enrolled student IDs from upstream session details.
router.post('/sync-enrollment/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const upstream = await apiClient.fetchSessionEnrollment(sessionId);
    const records = extractEnrollmentRecords(upstream);

    if (records.length === 0) {
      return res.status(422).json({
        error: 'No enrolled student records were found in upstream response',
      });
    }

    const ops = records.map((r) => ({
      updateOne: {
        filter: { email: new RegExp(`^${r.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        update: { $set: { hexadStudentId: r.hexadStudentId } },
      },
    }));

    const result = await Student.bulkWrite(ops, { ordered: false });
    const total = await Student.countDocuments();
    const mapped = await Student.countDocuments({ hexadStudentId: { $ne: null } });

    return res.json({
      success: true,
      sessionId,
      extracted: records.length,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      totalStudents: total,
      mappedStudents: mapped,
    });
  } catch (error) {
    const status = error.response?.status;
    if (status) {
      return res.status(status).json(error.response?.data || { error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
});

// GET: Fetch single student by ID
router.get('/:studentId', async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json({ student: withDerivedNames(student) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Delete single student
router.delete('/:studentId', async (req, res) => {
  try {
    const result = await Student.deleteOne({ studentId: req.params.studentId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json({ success: true, message: 'Student deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Delete all students
router.delete('/batch/all', async (req, res) => {
  try {
    const result = await Student.deleteMany({});
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function parseMappings(text) {
  const lines = String(text || '')
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);

  const mappings = [];
  for (const line of lines) {
    // allow CSV/TSV/space-separated
    const parts = line.split(/[\t,; ]+/g).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const a = parts[0];
    const b = parts[1];

    const aIsEmail = a.includes('@');
    const bIsEmail = b.includes('@');

    const email = aIsEmail ? a : bIsEmail ? b : null;
    const hexadStudentId = aIsEmail ? b : bIsEmail ? a : null;

    // fallback: allow mapping by local studentId (STD-001)
    const localStudentId = !email ? (String(a).toUpperCase().startsWith('STD-') ? String(a).toUpperCase() : (String(b).toUpperCase().startsWith('STD-') ? String(b).toUpperCase() : null)) : null;
    const fallbackHexadId = !email ? (localStudentId === String(a).toUpperCase() ? b : a) : null;

    if (email && hexadStudentId) {
      mappings.push({ keyType: 'email', keyValue: email.toLowerCase(), hexadStudentId });
    } else if (localStudentId && fallbackHexadId) {
      mappings.push({ keyType: 'studentId', keyValue: localStudentId, hexadStudentId: fallbackHexadId });
    }
  }
  return mappings;
}

// POST: Map Hexad-assigned student IDs back to simulator students.
// Body: { text: "hexadId,email\nhexadId,email\n..." }  (email preferred)
router.post('/map-hexad-ids', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required (paste mappings: hexadStudentId,email OR STD-001,hexadStudentId)' });
    }

    const mappings = parseMappings(text);
    if (mappings.length === 0) {
      return res.status(400).json({ error: 'No valid mappings found. Paste lines like: hexadStudentId,email' });
    }

    const ops = mappings.map((m) => {
      if (m.keyType === 'email') {
        return {
          updateOne: {
            filter: { email: new RegExp(`^${m.keyValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            update: { $set: { hexadStudentId: m.hexadStudentId } },
          },
        };
      }
      return {
        updateOne: {
          filter: { studentId: m.keyValue },
          update: { $set: { hexadStudentId: m.hexadStudentId } },
        },
      };
    });

    const result = await Student.bulkWrite(ops, { ordered: false });

    const total = await Student.countDocuments();
    const mapped = await Student.countDocuments({ hexadStudentId: { $ne: null } });

    return res.json({
      success: true,
      received: mappings.length,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      totalStudents: total,
      mappedStudents: mapped,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
