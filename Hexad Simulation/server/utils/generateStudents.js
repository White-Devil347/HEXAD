const Chance = require('chance');
const chance = new Chance();

// Fallback names list if Chance doesn't work as expected
const FALLBACK_NAMES = [
  'Rohan Sharma', 'Jane Doe', 'John Smith', 'Emma Johnson', 'Michael Chen',
  'Sarah Williams', 'David Brown', 'Lisa Anderson', 'James Martinez', 'Emily Taylor',
  'Robert Wilson', 'Jessica Lee', 'William Davis', 'Amanda Miller', 'Charles Moore',
  'Jennifer Jackson', 'Daniel White', 'Michelle Harris', 'Matthew Martin', 'Lauren Thompson',
  'Christopher Garcia', 'Brittany Robinson', 'Mark Lewis', 'Natalie Robinson', 'Donald White',
  'Kayla Robinson', 'Steven Jones', 'Karen White', 'Paul Davis', 'Nancy Smith',
  'Andrew Wilson', 'Deborah Wilson', 'Joshua Anderson', 'Barbara Johnson', 'Kenneth Taylor',
  'Donna Garcia', 'Kevin Martinez', 'Susan Hernandez', 'Brian Davis', 'Debra White'
];

function getRandomName() {
  try {
    // Chance generates realistic names
    return chance.name();
  } catch (error) {
    return FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)];
  }
}

function getRandomFirstLast() {
  try {
    const firstName = chance.first();
    const lastName = chance.last();
    if (firstName && lastName) {
      return { firstName, lastName, name: `${firstName} ${lastName}` };
    }
  } catch {
    // ignore, fall through to fallback parsing
  }

  const name = getRandomName();
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Student';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'User';
  return { firstName, lastName, name: `${firstName} ${lastName}` };
}

function generateEmail(name, domain, useStudentId = false, studentId = '') {
  if (useStudentId && studentId) {
    return `${studentId.toLowerCase()}@${domain}`;
  }
  const emailFormat = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s._-]/g, '')
    .replace(/\s+/g, '.');
  return `${emailFormat}@${domain}`;
}

function generatePhoneNumber() {
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const lineNumber = Math.floor(Math.random() * 9000) + 1000;
  return `+1-${areaCode}-${exchange}-${lineNumber}`;
}

function generateStudents(count, prefix, startingNumber, domain) {
  const students = [];

  for (let i = 0; i < count; i++) {
    const number = String(startingNumber + i).padStart(3, '0');
    const studentId = `${prefix}${number}`;
    const { firstName, lastName, name } = getRandomFirstLast();
    const email = generateEmail(name, domain);
    const phoneNumber = generatePhoneNumber();
    const genders = ['M', 'F', 'Other'];
    const gender = genders[Math.floor(Math.random() * genders.length)];

    students.push({
      studentId,
      firstName,
      lastName,
      name,
      email,
      phoneNumber,
      gender,
      domain,
    });
  }

  return students;
}

module.exports = {
  generateStudents,
  getRandomName,
  getRandomFirstLast,
  generateEmail,
  generatePhoneNumber,
};
