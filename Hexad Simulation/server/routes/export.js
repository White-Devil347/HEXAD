const express = require('express');
const router = express.Router();
const Student = require('../models/Student');

function deriveFirstLastFromName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
  };
}

// Helper: Convert to CSV
function convertToCSV(students) {
  if (!students || students.length === 0) {
    return '';
  }

  const headers = [
    'studentId',
    'firstName',
    'lastName',
    'name',
    'email',
    'phoneNumber',
    'gender',
    'domain',
    'createdAt',
  ];
  const csvContent = [
    headers.join(','),
    ...students.map((student) =>
      (() => {
        const derived = deriveFirstLastFromName(student.name);
        const firstName = student.firstName || derived.firstName;
        const lastName = student.lastName || derived.lastName;
        return [
        student.studentId,
        firstName,
        lastName,
        `"${student.name}"`,
        student.email,
        student.phoneNumber || '',
        student.gender || '',
        student.domain,
        student.createdAt,
        ].join(',');
      })()
    ),
  ].join('\n');

  return csvContent;
}

// GET: Export students as JSON
router.get('/json', async (req, res) => {
  try {
    const students = await Student.find();
    const normalized = students.map((s) => {
      const derived = deriveFirstLastFromName(s.name);
      const obj = s.toObject();
      return {
        ...obj,
        firstName: obj.firstName || derived.firstName,
        lastName: obj.lastName || derived.lastName,
      };
    });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="students.json"');
    res.json(normalized);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Export students as CSV
router.get('/csv', async (req, res) => {
  try {
    const students = await Student.find();
    const csv = convertToCSV(students);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
