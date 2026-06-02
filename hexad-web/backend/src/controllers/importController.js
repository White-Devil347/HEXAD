const multer = require('multer');
const { rtdb, auth } = require('../firebase/firebase');
const { response } = require('../utils');

const MAX_ROWS = 1000;

const ALLOWED_ROLES = new Set(['student', 'teacher', 'admin']);

const PATHS = {
    userProfile: (uid) => `users/${uid}`,
    collegeInfo: (collegeId) => `colleges/${collegeId}/info`,
    collegeUsers: (collegeId) => `colleges/${collegeId}/users`,
    collegeAdmins: (collegeId) => `colleges/${collegeId}/admins`,
    collegeTeachersInfo: (collegeId, uid) => `colleges/${collegeId}/teachers/${uid}`,
    collegeStudentsInfo: (collegeId, uid) => `colleges/${collegeId}/students/${uid}/info`,
    classStudents: (collegeId, classId) => `colleges/${collegeId}/classes/${classId}/students`,
    collegeDepartments: (collegeId) => `colleges/${collegeId}/departments`,
    collegeClasses: (collegeId) => `colleges/${collegeId}/classes`,
    teacherCounter: (collegeId) => `colleges/${collegeId}/counters/teacherCounter`,
    studentCounter: (collegeId) => `colleges/${collegeId}/counters/studentCounter`,
    teacherIdIndex: (collegeId, teacherId) => `colleges/${collegeId}/business_id_index/teachers/${teacherId}`,
    studentIdIndex: (collegeId, studentId) => `colleges/${collegeId}/business_id_index/students/${studentId}`
};

const readVal = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.val();
};

const normalizeInfoNode = (node) => {
    if (!node) return null;
    if (node && typeof node === 'object' && node.info && typeof node.info === 'object') return node.info;
    return node;
};

const toStr = (v) => String(v ?? '').trim();
const toLower = (v) => toStr(v).toLowerCase();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cryptoRandomPassword = () => {
    // 14 chars: good entropy, avoids special chars that can confuse CSV
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 14; i += 1) {
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
};

const splitName = (name) => {
    const full = toStr(name);
    if (!full) return { firstName: '', lastName: '' };
    const parts = full.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

const parseCSVGrid = (text) => {
    const input = String(text || '').replace(/^\uFEFF/, '');
    const out = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    const pushCell = () => {
        row.push(cell);
        cell = '';
    };

    const pushRow = () => {
        // Skip completely empty trailing rows
        if (row.length === 1 && toStr(row[0]) === '' && out.length > 0) {
            row = [];
            return;
        }
        out.push(row);
        row = [];
    };

    for (let i = 0; i < input.length; i += 1) {
        const ch = input[i];

        if (inQuotes) {
            if (ch === '"') {
                const next = input[i + 1];
                if (next === '"') {
                    cell += '"';
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                cell += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === ',') {
            pushCell();
            continue;
        }
        if (ch === '\n') {
            pushCell();
            pushRow();
            continue;
        }
        if (ch === '\r') {
            continue;
        }

        cell += ch;
    }

    pushCell();
    if (row.length > 0) pushRow();

    return out;
};

const parseUsersFromFile = (file) => {
    const originalName = String(file?.originalname || '').toLowerCase();
    const raw = Buffer.isBuffer(file?.buffer) ? file.buffer.toString('utf8') : '';

    if (!raw) {
        return { error: 'Empty file' };
    }

    if (originalName.endsWith('.json')) {
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            return { error: `Invalid JSON: ${e.message}` };
        }

        if (!Array.isArray(parsed)) {
            return { error: 'JSON must be a top-level array of users' };
        }

        const users = parsed.map((u, idx) => ({ ...u, __row: idx + 1 }));
        return { users };
    }

    if (originalName.endsWith('.csv')) {
        const grid = parseCSVGrid(raw);
        if (!Array.isArray(grid) || grid.length < 2) {
            return { error: 'CSV must include a header row and at least 1 data row' };
        }

        const header = grid[0].map((h) => toStr(h));
        const index = new Map();
        header.forEach((h, i) => {
            if (h) index.set(h, i);
        });

        const requiredHeaders = ['name', 'email', 'role', 'collegeId', 'department', 'className', 'rollNumber'];
        const missing = requiredHeaders.filter((h) => !index.has(h));
        if (missing.length > 0) {
            return { error: `Missing required CSV headers: ${missing.join(', ')}` };
        }

        const users = grid.slice(1).map((line, idx) => {
            const out = {};
            requiredHeaders.forEach((h) => {
                out[h] = line[index.get(h)] ?? '';
            });
            // header row is row 1 in CSV, so first data row is row 2
            out.__row = idx + 2;
            return out;
        });

        return { users };
    }

    return { error: 'Unsupported file type. Upload a .json or .csv file.' };
};

const sanitizeUser = (raw) => {
    const u = raw && typeof raw === 'object' ? raw : {};
    return {
        row: Number(u.__row) || 0,
        name: toStr(u.name).slice(0, 100),
        email: toStr(u.email).slice(0, 254),
        role: toLower(u.role),
        collegeId: toStr(u.collegeId).slice(0, 100),
        department: toStr(u.department).slice(0, 100),
        className: toStr(u.className).slice(0, 100),
        rollNumber: toStr(u.rollNumber).slice(0, 50)
    };
};

const tryReserveIndex = async (path) => {
    const ref = rtdb().ref(path);
    const result = await ref.transaction((current) => {
        if (current === null) return '__reserved__';
        return;
    }, undefined, false);
    return result.committed === true;
};

const releaseIndexIfReserved = async (path) => {
    const ref = rtdb().ref(path);
    await ref.transaction((current) => {
        if (current === '__reserved__') return null;
        return;
    }, undefined, false);
};

const incrementCounter = async (counterPath) => {
    const ref = rtdb().ref(counterPath);
    const result = await ref.transaction((current) => {
        const curr = Number(current) || 0;
        return curr + 1;
    }, undefined, false);
    if (!result.committed) throw new Error('Failed to allocate counter');
    return Number(result.snapshot.val()) || 0;
};

const formatBusinessId = (prefix, n) => `${prefix}-${String(Number(n) || 0).padStart(3, '0')}`;

const allocateBusinessId = async ({ collegeId, kind }) => {
    const prefix = kind === 'teacher' ? 'TCH' : 'STD';
    const counterPath = kind === 'teacher' ? PATHS.teacherCounter(collegeId) : PATHS.studentCounter(collegeId);

    for (let attempt = 0; attempt < 25; attempt += 1) {
        const nextNum = await incrementCounter(counterPath);
        const businessId = formatBusinessId(prefix, nextNum);
        const indexPath = kind === 'teacher'
            ? PATHS.teacherIdIndex(collegeId, businessId)
            : PATHS.studentIdIndex(collegeId, businessId);

        const reserved = await tryReserveIndex(indexPath);
        if (reserved) return { businessId, indexPath };
    }

    throw new Error('Failed to allocate a unique ID');
};

const loadCollegeLookups = async (collegeId, cache) => {
    if (cache.has(collegeId)) return cache.get(collegeId);

    const [deptRaw, classRaw] = await Promise.all([
        readVal(PATHS.collegeDepartments(collegeId)),
        readVal(PATHS.collegeClasses(collegeId))
    ]);

    const departments = Object.entries(deptRaw || {}).map(([id, node]) => ({ id, ...(normalizeInfoNode(node) || {}) }));
    const classes = Object.entries(classRaw || {}).map(([id, node]) => ({ id, ...(normalizeInfoNode(node) || {}) }));

    const deptByKey = new Map();
    const classByKey = new Map();

    const addMulti = (map, key, value) => {
        if (!key) return;
        const k = toLower(key);
        if (!k) return;
        const arr = map.get(k) || [];
        arr.push(value);
        map.set(k, arr);
    };

    departments.forEach((d) => {
        addMulti(deptByKey, d.code, d);
        addMulti(deptByKey, d.name, d);
    });

    classes.forEach((c) => {
        addMulti(classByKey, c.code, c);
        addMulti(classByKey, c.name, c);
    });

    const lookups = { departments, classes, deptByKey, classByKey };
    cache.set(collegeId, lookups);
    return lookups;
};

const resolveDepartmentAndClass = async ({ collegeId, department, className, cache }) => {
    const lookups = await loadCollegeLookups(collegeId, cache);

    const deptKey = toLower(department);
    const clsKey = toLower(className);

    const deptMatches = deptKey ? (lookups.deptByKey.get(deptKey) || []) : [];
    const classMatches = clsKey ? (lookups.classByKey.get(clsKey) || []) : [];

    if (classMatches.length === 0) {
        throw new Error('Class not found (className)');
    }

    let chosenClass = null;

    if (classMatches.length === 1) {
        chosenClass = classMatches[0];
    } else {
        // If multiple classes match, try to disambiguate with department
        if (deptMatches.length === 1) {
            const deptId = deptMatches[0].id;
            const filtered = classMatches.filter((c) => String(c.departmentId || '') === String(deptId));
            if (filtered.length === 1) {
                chosenClass = filtered[0];
            } else {
                throw new Error('Ambiguous className (multiple matches)');
            }
        } else {
            throw new Error('Ambiguous className (multiple matches)');
        }
    }

    const classDepartmentId = chosenClass?.departmentId ?? null;

    let chosenDepartmentId = classDepartmentId;
    if (deptMatches.length === 1) {
        chosenDepartmentId = deptMatches[0].id;
        if (classDepartmentId && String(chosenDepartmentId) !== String(classDepartmentId)) {
            throw new Error('className does not belong to the provided department');
        }
    }

    if (!chosenDepartmentId) {
        throw new Error('Department could not be resolved');
    }

    return { departmentId: chosenDepartmentId, classId: chosenClass.id };
};

const toFirebaseDisplayName = (u) => toStr(u.name) || undefined;

const createImportedUser = async ({ user, requester, lookupsCache }) => {
    const nowMs = Date.now();

    // Scope enforcement
    if (!requester?.isSuperAdmin) {
        const scopedCollegeId = toStr(requester?.collegeId);
        if (!scopedCollegeId) {
            throw new Error('Missing collegeId in requester context');
        }
        if (toStr(user.collegeId) !== scopedCollegeId) {
            throw new Error(`collegeId must match admin scope (${scopedCollegeId})`);
        }
    }

    if (!ALLOWED_ROLES.has(user.role)) {
        throw new Error('Invalid role');
    }

    // Ensure college exists
    const collegeInfo = await readVal(PATHS.collegeInfo(user.collegeId));
    if (!collegeInfo) {
        throw new Error('College not found');
    }

    let departmentId = null;
    let classId = null;

    if (user.role === 'student') {
        const resolved = await resolveDepartmentAndClass({
            collegeId: user.collegeId,
            department: user.department,
            className: user.className,
            cache: lookupsCache
        });
        departmentId = resolved.departmentId;
        classId = resolved.classId;
    }

    // Create Auth user first (email uniqueness enforced here)
    const password = cryptoRandomPassword();

    const userRecord = await auth().createUser({
        email: user.email,
        password,
        displayName: toFirebaseDisplayName(user)
    });

    const uid = userRecord.uid;

    // Create DB profile + indexes. Roll back Auth user on DB failure.
    let reservation = null;
    try {
        const { firstName, lastName } = splitName(user.name);

        const updates = {};

        if (user.role === 'teacher') {
            reservation = await allocateBusinessId({ collegeId: user.collegeId, kind: 'teacher' });

            const profile = {
                uid,
                email: user.email,
                role: 'teacher',
                teacherId: reservation.businessId,
                collegeId: user.collegeId,
                firstName,
                lastName: lastName || null,
                phone: null,
                isActive: true,
                created_at_ms: nowMs
            };

            const displayName = `${firstName || ''} ${lastName || ''}`.trim() || null;

            updates[PATHS.userProfile(uid)] = profile;
            updates[PATHS.collegeTeachersInfo(user.collegeId, uid)] = {
                displayName,
                email: user.email,
                departmentId: null,
                isActive: true,
                createdAt: new Date(nowMs).toISOString(),
                createdAtMs: nowMs,
                created_at_ms: nowMs,
                info: {
                    teacherId: reservation.businessId
                }
            };
            updates[`${PATHS.collegeUsers(user.collegeId)}/${uid}`] = true;
            updates[reservation.indexPath] = uid;
        } else if (user.role === 'student') {
            reservation = await allocateBusinessId({ collegeId: user.collegeId, kind: 'student' });

            const profile = {
                uid,
                email: user.email,
                role: 'student',
                studentId: reservation.businessId,
                collegeId: user.collegeId,
                departmentId,
                classId,
                firstName,
                lastName: lastName || null,
                phone: null,
                isActive: true,
                created_at_ms: nowMs
            };

            updates[PATHS.userProfile(uid)] = profile;
            updates[PATHS.collegeStudentsInfo(user.collegeId, uid)] = {
                uid,
                email: user.email,
                firstName,
                lastName: lastName || null,
                phone: null,
                studentId: reservation.businessId,
                departmentId,
                classId,
                rollNumber: user.rollNumber || null,
                enrollmentYear: null,
                isActive: true,
                created_at_ms: nowMs
            };
            updates[`${PATHS.collegeUsers(user.collegeId)}/${uid}`] = true;
            updates[`${PATHS.classStudents(user.collegeId, classId)}/${uid}`] = true;
            updates[reservation.indexPath] = uid;
        } else if (user.role === 'admin') {
            const profile = {
                uid,
                email: user.email,
                role: 'admin',
                collegeId: user.collegeId,
                firstName: firstName || null,
                lastName: lastName || null,
                isActive: true,
                created_at_ms: nowMs,
                created_at: new Date(nowMs).toISOString()
            };

            updates[PATHS.userProfile(uid)] = profile;
            updates[`${PATHS.collegeAdmins(user.collegeId)}/${uid}`] = true;
            updates[`${PATHS.collegeUsers(user.collegeId)}/${uid}`] = true;
        }

        await rtdb().ref().update(updates);

        return { uid };
    } catch (e) {
        if (reservation && reservation.indexPath) {
            await releaseIndexIfReserved(reservation.indexPath);
        }
        try { await auth().deleteUser(uid); } catch (_) { /* ignore */ }
        throw e;
    }
};

// Multer config (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

exports.importUsersUploadMiddleware = upload.single('file');

exports.importUsers = async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'Missing file. Upload a JSON or CSV file as form-data field "file".'
            });
        }

        const parsed = parseUsersFromFile(file);
        if (parsed.error) {
            return res.status(400).json({
                success: false,
                message: parsed.error
            });
        }

        const rawUsers = Array.isArray(parsed.users) ? parsed.users : [];
        if (rawUsers.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No users found in file.'
            });
        }

        if (rawUsers.length > MAX_ROWS) {
            return res.status(400).json({
                success: false,
                message: `Too many rows (max ${MAX_ROWS}).`
            });
        }

        const users = rawUsers.map(sanitizeUser);

        const errors = [];
        const valid = [];
        const seenEmails = new Map();

        for (let i = 0; i < users.length; i += 1) {
            const u = users[i];

            const fail = (reason) => {
                errors.push({ row: u.row || i + 1, reason });
            };

            if (!u.name) { fail('Name is required'); continue; }
            if (!u.email) { fail('Email is required'); continue; }
            if (!emailRegex.test(u.email)) { fail('Invalid email'); continue; }
            if (!u.role) { fail('Role is required'); continue; }
            if (!ALLOWED_ROLES.has(u.role)) { fail('Invalid role'); continue; }
            if (!u.collegeId) { fail('collegeId is required'); continue; }

            if (!req.user?.isSuperAdmin) {
                const scoped = toStr(req.user?.collegeId);
                if (!scoped) { fail('Missing collegeId in requester scope'); continue; }
                if (u.collegeId !== scoped) { fail('collegeId does not match admin scope'); continue; }
            }

            if (u.role === 'student') {
                if (!u.rollNumber) { fail('rollNumber is required for students'); continue; }
                if (!u.className) { fail('className is required for students'); continue; }
            }

            const key = toLower(u.email);
            const existing = seenEmails.get(key);
            if (existing) {
                fail(`Duplicate email in file (also row ${existing})`);
                continue;
            }
            seenEmails.set(key, u.row || i + 1);

            valid.push(u);
        }

        const lookupsCache = new Map();

        let inserted = 0;
        for (let i = 0; i < valid.length; i += 1) {
            const u = valid[i];
            try {
                await createImportedUser({ user: u, requester: req.user, lookupsCache });
                inserted += 1;
            } catch (e) {
                const code = String(e?.code || '');
                const msg = String(e?.message || 'Failed');
                if (code === 'auth/email-already-exists') {
                    errors.push({ row: u.row, reason: 'Duplicate email' });
                } else if (code === 'auth/invalid-email') {
                    errors.push({ row: u.row, reason: 'Invalid email' });
                } else if (msg) {
                    errors.push({ row: u.row, reason: msg });
                } else {
                    errors.push({ row: u.row, reason: 'Failed' });
                }
            }
        }

        const total = users.length;
        const failed = total - inserted;

        return res.status(200).json({
            success: true,
            total,
            inserted,
            failed,
            errors
        });
    } catch (error) {
        console.error('Import users error:', error);
        return response.serverError(res, error?.message || 'Failed to import users');
    }
};
