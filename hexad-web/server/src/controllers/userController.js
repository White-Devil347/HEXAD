const { v4: uuidv4 } = require('uuid');
const { rtdb, auth } = require('../firebase/firebase');
const { response } = require('../utils');

const PATHS = {
    userProfile: (uid) => `users/${uid}`,
    collegeUsers: (collegeId) => `colleges/${collegeId}/users`,
    collegeTeachersInfo: (collegeId, uid) => `colleges/${collegeId}/teachers/${uid}`,
    collegeStudentsInfo: (collegeId, uid) => `colleges/${collegeId}/students/${uid}/info`,
    classStudents: (collegeId, classId) => `colleges/${collegeId}/classes/${classId}/students`,
    collegeDepartments: (collegeId) => `colleges/${collegeId}/departments`,
    collegeDepartment: (collegeId, departmentId) => `colleges/${collegeId}/departments/${departmentId}`,
    collegeClasses: (collegeId) => `colleges/${collegeId}/classes`,
    collegeClass: (collegeId, classId) => `colleges/${collegeId}/classes/${classId}`,
    teacherCounter: (collegeId) => `colleges/${collegeId}/counters/teacherCounter`,
    studentCounter: (collegeId) => `colleges/${collegeId}/counters/studentCounter`,
    teacherIdIndex: (collegeId, teacherId) => `colleges/${collegeId}/business_id_index/teachers/${teacherId}`,
    studentIdIndex: (collegeId, studentId) => `colleges/${collegeId}/business_id_index/students/${studentId}`,
    teacherAssignmentsRoot: (collegeId) => `colleges/${collegeId}/teacher_assignments`,
    teacherAssignments: (collegeId, teacherUid) => `colleges/${collegeId}/teacher_assignments/${teacherUid}`,
    teacherAssignment: (collegeId, teacherUid, assignmentId) => `colleges/${collegeId}/teacher_assignments/${teacherUid}/${assignmentId}`
};

const readVal = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.val();
};

const exists = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.exists();
};

const paginateArray = (items, page, limit) => {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const offset = (p - 1) * l;
    return { page: p, limit: l, total: items.length, items: items.slice(offset, offset + l) };
};

const normalizeSearch = (str) => String(str || '').toLowerCase();

const resolveCollegeScope = (req, requestedCollegeId) => {
    const userCollegeId = req.user?.collegeId || null;
    const isSuperAdmin = req.user?.isSuperAdmin === true;

    if (requestedCollegeId && !isSuperAdmin) {
        return { forbidden: true };
    }

    if (isSuperAdmin) {
        return { collegeId: requestedCollegeId || userCollegeId || null };
    }

    return { collegeId: userCollegeId };
};

const normalizeBusinessId = (raw) => String(raw || '').trim().toUpperCase();

const parseBusinessIdNumber = (businessId, prefix) => {
    const id = normalizeBusinessId(businessId);
    const m = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
};

const formatBusinessId = (prefix, n) => {
    const num = Number(n);
    return `${prefix}-${String(num).padStart(3, '0')}`;
};

const tryReserveIndex = async (path) => {
    const ref = rtdb().ref(path);
    const result = await ref.transaction((current) => {
        if (current === null) return '__reserved__';
        return;
    }, undefined, false);
    return result.committed === true;
};

const finalizeIndex = async (path, uid) => {
    await rtdb().ref(path).set(uid);
};

const releaseIndexIfReserved = async (path) => {
    const ref = rtdb().ref(path);
    await ref.transaction((current) => {
        if (current === '__reserved__') return null;
        return;
    }, undefined, false);
};

const bumpCounterAtLeast = async (counterPath, minValue) => {
    const ref = rtdb().ref(counterPath);
    await ref.transaction((current) => {
        const curr = Number(current) || 0;
        const next = Math.max(curr, Number(minValue) || 0);
        return next;
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

const allocateBusinessId = async ({ collegeId, kind }) => {
    const prefix = kind === 'teacher' ? 'TCH' : 'STD';
    const counterPath = kind === 'teacher' ? PATHS.teacherCounter(collegeId) : PATHS.studentCounter(collegeId);

    // Loop to handle rare collisions (e.g., manual assignment already reserved same id).
    for (let attempt = 0; attempt < 25; attempt += 1) {
        const nextNum = await incrementCounter(counterPath);
        const businessId = formatBusinessId(prefix, nextNum);
        const indexPath = kind === 'teacher'
            ? PATHS.teacherIdIndex(collegeId, businessId)
            : PATHS.studentIdIndex(collegeId, businessId);
        const reserved = await tryReserveIndex(indexPath);
        if (reserved) return { businessId, businessNumber: nextNum, indexPath };
    }

    throw new Error('Failed to allocate a unique ID');
};

const reserveManualBusinessId = async ({ collegeId, kind, rawBusinessId }) => {
    const prefix = kind === 'teacher' ? 'TCH' : 'STD';
    const normalized = normalizeBusinessId(rawBusinessId);
    const n = parseBusinessIdNumber(normalized, prefix);
    if (!n) {
        throw new Error(`${prefix} ID must match ${prefix}-001 format`);
    }

    const businessId = formatBusinessId(prefix, n);
    const indexPath = kind === 'teacher'
        ? PATHS.teacherIdIndex(collegeId, businessId)
        : PATHS.studentIdIndex(collegeId, businessId);

    const reserved = await tryReserveIndex(indexPath);
    if (!reserved) {
        throw new Error(`${prefix} ID already exists`);
    }

    const counterPath = kind === 'teacher' ? PATHS.teacherCounter(collegeId) : PATHS.studentCounter(collegeId);
    await bumpCounterAtLeast(counterPath, n);

    return { businessId, businessNumber: n, indexPath };
};

const setUserIndexes = async (collegeId, uid) => {
    if (!collegeId) return;
    await rtdb().ref(`${PATHS.collegeUsers(collegeId)}/${uid}`).set(true);
};

const ensureValidDepartmentAndClass = async ({ collegeId, departmentId, classId, cache }) => {
    const localCache = cache || { departments: new Map(), classes: new Map() };

    const getCachedOrRead = async (bucket, key, readFn) => {
        if (!key) return null;
        if (bucket.has(key)) return bucket.get(key);
        const val = await readFn();
        bucket.set(key, val);
        return val;
    };

    const [departmentRaw, classRaw] = await Promise.all([
        getCachedOrRead(localCache.departments, departmentId, () => readVal(PATHS.collegeDepartment(collegeId, departmentId))),
        getCachedOrRead(localCache.classes, classId, () => readVal(PATHS.collegeClass(collegeId, classId)))
    ]);

    if (!departmentRaw) {
        const err = new Error('Department not found');
        err.statusCode = 404;
        throw err;
    }

    if (!classRaw) {
        const err = new Error('Class not found');
        err.statusCode = 404;
        throw err;
    }

    const classDepartmentId = classRaw?.departmentId ?? classRaw?.info?.departmentId ?? null;
    if (!classDepartmentId || String(classDepartmentId) !== String(departmentId)) {
        const err = new Error('Selected class does not belong to the selected department');
        err.statusCode = 400;
        throw err;
    }

    return { classInfo: classRaw, departmentInfo: departmentRaw };
};

exports.getUsers = async (req, res) => {
    try {
        const scope = resolveCollegeScope(req, req.query.collegeId);
        if (scope.forbidden) return response.forbidden(res, 'Access denied');
        const collegeId = scope.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { page = 1, limit = 20, role, search } = req.query;
        const index = await readVal(PATHS.collegeUsers(collegeId)) || {};
        const uids = Object.keys(index);

        const profiles = await Promise.all(uids.map((uid) => readVal(PATHS.userProfile(uid))));
        let users = uids
            .map((uid, i) => ({ id: uid, uid, ...(profiles[i] || {}) }))
            .filter((u) => u && u.collegeId === collegeId);

        if (role) users = users.filter((u) => u.role === role);
        if (search) {
            const s = normalizeSearch(search);
            users = users.filter((u) => {
                const full = `${u.firstName || ''} ${u.lastName || ''}`.trim();
                return normalizeSearch(u.email).includes(s) || normalizeSearch(full).includes(s) || normalizeSearch(u.phone).includes(s);
            });
        }

        users.sort((a, b) => normalizeSearch(a.email).localeCompare(normalizeSearch(b.email)));
        const paged = paginateArray(users, page, limit);

        return response.paginatedResponse(res, paged.items, paged.total, paged.page, paged.limit);
    } catch (error) {
        console.error('Get users error:', error);
        return response.serverError(res, 'Failed to fetch users');
    }
};

exports.getUserById = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await readVal(PATHS.userProfile(userId));
        if (!user) return response.notFound(res, 'User not found');

        const requesterCollegeId = req.user?.collegeId || null;
        const isSuperAdmin = req.user?.isSuperAdmin === true;
        if (!isSuperAdmin) {
            if (!requesterCollegeId) return response.error(res, 'Missing collegeId', 400);
            if (user.collegeId !== requesterCollegeId) return response.forbidden(res, 'Access denied');
        }

        return response.success(res, { id: userId, uid: userId, ...user });
    } catch (error) {
        console.error('Get user error:', error);
        return response.serverError(res, 'Failed to fetch user');
    }
};

exports.getUsersBulk = async (req, res) => {
    try {
        const body = req.body;
        const uids = Array.isArray(body) ? body : (Array.isArray(body?.uids) ? body.uids : []);
        const unique = Array.from(new Set(uids.map((u) => String(u || '').trim()).filter(Boolean)));
        if (unique.length === 0) return response.success(res, { users: {} });
        if (unique.length > 200) return response.error(res, 'Too many user IDs (max 200)', 400);

        const requesterCollegeId = req.user?.collegeId || null;
        const isSuperAdmin = req.user?.isSuperAdmin === true;
        if (!isSuperAdmin && !requesterCollegeId) return response.error(res, 'Missing collegeId', 400);

        const profiles = await Promise.all(unique.map((uid) => readVal(PATHS.userProfile(uid))));
        const users = {};
        unique.forEach((uid, idx) => {
            const p = profiles[idx] || null;
            if (!p) return;
            if (!isSuperAdmin && p.collegeId !== requesterCollegeId) return;
            users[uid] = { id: uid, uid, ...p };
        });

        return response.success(res, { users });
    } catch (error) {
        console.error('Bulk get users error:', error);
        return response.serverError(res, 'Failed to fetch users');
    }
};

exports.createTeacher = async (req, res) => {
    try {
        const scope = resolveCollegeScope(req, req.body.collegeId);
        if (scope.forbidden) return response.forbidden(res, 'Access denied');
        const collegeId = scope.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { email, password, firstName, lastName, phone, teacherId } = req.body;

        const reservation = teacherId
            ? await reserveManualBusinessId({ collegeId, kind: 'teacher', rawBusinessId: teacherId })
            : await allocateBusinessId({ collegeId, kind: 'teacher' });

        let userRecord;
        try {
            userRecord = await auth().createUser({
                email,
                password,
                displayName: `${firstName || ''} ${lastName || ''}`.trim() || undefined
            });
        } catch (e) {
            await releaseIndexIfReserved(reservation.indexPath);
            throw e;
        }

        const uid = userRecord.uid;
        const nowMs = Date.now();

        const displayName = `${firstName || ''} ${lastName || ''}`.trim() || null;

        const profile = {
            uid,
            email,
            role: 'teacher',
            teacherId: reservation.businessId,
            collegeId,
            firstName,
            lastName: lastName || null,
            phone: phone || null,
            isActive: true,
            created_at_ms: nowMs
        };

        const updates = {};
        updates[PATHS.userProfile(uid)] = profile;
        updates[`${PATHS.collegeTeachersInfo(collegeId, uid)}`] = {
            displayName,
            email,
            departmentId: null,
            isActive: true,
            createdAt: new Date(nowMs).toISOString(),
            createdAtMs: nowMs,
            created_at_ms: nowMs,
            info: {
                teacherId: reservation.businessId
            }
        };
        updates[`${PATHS.collegeUsers(collegeId)}/${uid}`] = true;
        updates[reservation.indexPath] = uid;

        try {
            await rtdb().ref().update(updates);
        } catch (e) {
            // Best-effort cleanup to avoid orphaned reserved IDs.
            await releaseIndexIfReserved(reservation.indexPath);
            try { await auth().deleteUser(uid); } catch (_) { /* ignore */ }
            throw e;
        }
        await req.audit('CREATE_TEACHER', 'user', uid, null, { email, collegeId });

        return response.created(res, { id: uid, uid }, 'Teacher created');
    } catch (error) {
        console.error('Create teacher error:', error);
        return response.serverError(res, error?.message || 'Failed to create teacher');
    }
};

exports.createStudent = async (req, res) => {
    try {
        const scope = resolveCollegeScope(req, req.body.collegeId);
        if (scope.forbidden) return response.forbidden(res, 'Access denied');
        const collegeId = scope.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { email, password, firstName, lastName, phone, departmentId, classId, rollNumber, enrollmentYear, studentId } = req.body;

        try {
            await ensureValidDepartmentAndClass({ collegeId, departmentId, classId });
        } catch (e) {
            return response.error(res, e.message || 'Invalid department/class selection', e.statusCode || 400);
        }

        const reservation = studentId
            ? await reserveManualBusinessId({ collegeId, kind: 'student', rawBusinessId: studentId })
            : await allocateBusinessId({ collegeId, kind: 'student' });

        let userRecord;
        try {
            userRecord = await auth().createUser({
                email,
                password,
                displayName: `${firstName || ''} ${lastName || ''}`.trim() || undefined
            });
        } catch (e) {
            await releaseIndexIfReserved(reservation.indexPath);
            throw e;
        }

        const uid = userRecord.uid;
        const nowMs = Date.now();

        const profile = {
            uid,
            email,
            role: 'student',
            studentId: reservation.businessId,
            collegeId,
            departmentId,
            classId,
            firstName,
            lastName: lastName || null,
            phone: phone || null,
            isActive: true,
            created_at_ms: nowMs
        };

        const updates = {};
        updates[PATHS.userProfile(uid)] = profile;
        updates[`${PATHS.collegeStudentsInfo(collegeId, uid)}`] = {
            uid,
            email,
            firstName,
            lastName: lastName || null,
            phone: phone || null,
            studentId: reservation.businessId,
            departmentId,
            classId,
            rollNumber: rollNumber ?? null,
            enrollmentYear: enrollmentYear ?? null,
            isActive: true,
            created_at_ms: nowMs
        };
        updates[`${PATHS.collegeUsers(collegeId)}/${uid}`] = true;
        updates[`${PATHS.classStudents(collegeId, classId)}/${uid}`] = true;
        updates[reservation.indexPath] = uid;

        try {
            await rtdb().ref().update(updates);
        } catch (e) {
            await releaseIndexIfReserved(reservation.indexPath);
            try { await auth().deleteUser(uid); } catch (_) { /* ignore */ }
            throw e;
        }
        await req.audit('CREATE_STUDENT', 'user', uid, null, { email, classId, collegeId });

        return response.created(res, { id: uid, uid }, 'Student created');
    } catch (error) {
        console.error('Create student error:', error);
        return response.serverError(res, error?.message || 'Failed to create student');
    }
};

exports.bulkImportStudents = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { students } = req.body;
        const results = [];

        const cache = { departments: new Map(), classes: new Map() };

        // Validate department/class relationships up-front so the import doesn't partially succeed.
        const validationErrors = [];
        for (let i = 0; i < students.length; i += 1) {
            const s = students[i];
            try {
                await ensureValidDepartmentAndClass({
                    collegeId,
                    departmentId: s.departmentId,
                    classId: s.classId,
                    cache
                });
            } catch (e) {
                validationErrors.push({
                    index: i,
                    email: s?.email,
                    message: e.message || 'Invalid department/class selection'
                });
            }
        }

        if (validationErrors.length > 0) {
            return response.error(res, 'Bulk import validation failed', 400, validationErrors);
        }

        for (const s of students) {
            try {
                const { departmentId, classId, studentId } = s;
                const password = s.password || cryptoRandomPassword();

                const reservation = studentId
                    ? await reserveManualBusinessId({ collegeId, kind: 'student', rawBusinessId: studentId })
                    : await allocateBusinessId({ collegeId, kind: 'student' });

                let userRecord;
                try {
                    userRecord = await auth().createUser({
                        email: s.email,
                        password,
                        displayName: `${s.firstName || ''} ${s.lastName || ''}`.trim() || undefined
                    });
                } catch (e) {
                    await releaseIndexIfReserved(reservation.indexPath);
                    throw e;
                }

                const uid = userRecord.uid;
                const nowMs = Date.now();

                const profile = {
                    uid,
                    email: s.email,
                    role: 'student',
                    studentId: reservation.businessId,
                    collegeId,
                    departmentId,
                    classId,
                    firstName: s.firstName,
                    lastName: s.lastName || null,
                    phone: s.phone || null,
                    isActive: true,
                    created_at_ms: nowMs
                };

                const updates = {};
                updates[PATHS.userProfile(uid)] = profile;
                updates[`${PATHS.collegeStudentsInfo(collegeId, uid)}`] = {
                    uid,
                    email: s.email,
                    firstName: s.firstName,
                    lastName: s.lastName || null,
                    phone: s.phone || null,
                    studentId: reservation.businessId,
                    departmentId,
                    classId,
                    rollNumber: s.rollNumber ?? null,
                    enrollmentYear: s.enrollmentYear ?? null,
                    isActive: true,
                    created_at_ms: nowMs
                };
                updates[`${PATHS.collegeUsers(collegeId)}/${uid}`] = true;
                updates[`${PATHS.classStudents(collegeId, classId)}/${uid}`] = true;
                updates[reservation.indexPath] = uid;

                try {
                    await rtdb().ref().update(updates);
                } catch (e) {
                    await releaseIndexIfReserved(reservation.indexPath);
                    try { await auth().deleteUser(uid); } catch (_) { /* ignore */ }
                    throw e;
                }

                results.push({
                    email: s.email,
                    uid,
                    status: 'success',
                    passwordProvided: Boolean(s.password),
                    studentId: reservation.businessId,
                    departmentId,
                    classId
                });
            } catch (e) {
                results.push({
                    email: s.email,
                    status: 'failed',
                    error: e.message,
                    departmentId: s?.departmentId,
                    classId: s?.classId
                });
            }
        }

        await req.audit('BULK_IMPORT_STUDENTS', 'user', null, null, { count: students.length });

        const totalImported = results.filter((r) => r.status === 'success').length;
        const totalFailed = results.filter((r) => r.status === 'failed').length;
        const counterAfter = await readVal(PATHS.studentCounter(collegeId));

        return response.success(res, {
            totalImported,
            totalFailed,
            studentCounterAfter: Number(counterAfter) || 0,
            results
        });
    } catch (error) {
        console.error('Bulk import error:', error);
        return response.serverError(res, 'Failed to import students');
    }
};

exports.bulkImportTeachers = async (req, res) => {
    try {
        const scope = resolveCollegeScope(req, req.body.collegeId);
        if (scope.forbidden) return response.forbidden(res, 'Access denied');
        const collegeId = scope.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { teachers } = req.body;
        const results = [];

        // Pre-validate basic required fields so we can fail fast on shape issues.
        const validationErrors = [];
        for (let i = 0; i < teachers.length; i += 1) {
            const t = teachers[i] || {};
            const email = String(t.email || '').trim();
            const firstName = String(t.firstName || '').trim();
            const lastName = String(t.lastName || '').trim();
            if (!email || !firstName || !lastName) {
                validationErrors.push({
                    index: i,
                    email: t?.email,
                    message: 'Missing required fields: email, firstName, lastName'
                });
            }
        }

        if (validationErrors.length > 0) {
            return response.error(res, 'Bulk import validation failed', 400, validationErrors);
        }

        for (const t of teachers) {
            try {
                const password = t.password || cryptoRandomPassword();

                const reservation = t.teacherId
                    ? await reserveManualBusinessId({ collegeId, kind: 'teacher', rawBusinessId: t.teacherId })
                    : await allocateBusinessId({ collegeId, kind: 'teacher' });

                let userRecord;
                try {
                    userRecord = await auth().createUser({
                        email: t.email,
                        password,
                        displayName: `${t.firstName || ''} ${t.lastName || ''}`.trim() || undefined
                    });
                } catch (e) {
                    await releaseIndexIfReserved(reservation.indexPath);
                    throw e;
                }

                const uid = userRecord.uid;
                const nowMs = Date.now();
                const displayName = `${t.firstName || ''} ${t.lastName || ''}`.trim() || null;

                const profile = {
                    uid,
                    email: t.email,
                    role: 'teacher',
                    teacherId: reservation.businessId,
                    collegeId,
                    firstName: t.firstName,
                    lastName: t.lastName || null,
                    phone: t.phone || null,
                    isActive: true,
                    created_at_ms: nowMs
                };

                const updates = {};
                updates[PATHS.userProfile(uid)] = profile;
                updates[`${PATHS.collegeTeachersInfo(collegeId, uid)}`] = {
                    displayName,
                    email: t.email,
                    departmentId: null,
                    isActive: true,
                    createdAt: new Date(nowMs).toISOString(),
                    createdAtMs: nowMs,
                    created_at_ms: nowMs,
                    info: {
                        teacherId: reservation.businessId
                    }
                };
                updates[`${PATHS.collegeUsers(collegeId)}/${uid}`] = true;
                updates[reservation.indexPath] = uid;

                try {
                    await rtdb().ref().update(updates);
                } catch (e) {
                    await releaseIndexIfReserved(reservation.indexPath);
                    try { await auth().deleteUser(uid); } catch (_) { /* ignore */ }
                    throw e;
                }

                results.push({
                    email: t.email,
                    uid,
                    status: 'success',
                    passwordProvided: Boolean(t.password),
                    teacherId: reservation.businessId
                });
            } catch (e) {
                results.push({
                    email: t?.email,
                    status: 'failed',
                    error: e.message
                });
            }
        }

        await req.audit('BULK_IMPORT_TEACHERS', 'user', null, null, { count: teachers.length });

        const totalImported = results.filter((r) => r.status === 'success').length;
        const totalFailed = results.filter((r) => r.status === 'failed').length;
        const counterAfter = await readVal(PATHS.teacherCounter(collegeId));

        return response.success(res, {
            totalImported,
            totalFailed,
            teacherCounterAfter: Number(counterAfter) || 0,
            results
        });
    } catch (error) {
        console.error('Bulk import teachers error:', error);
        return response.serverError(res, 'Failed to import teachers');
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const existing = await readVal(PATHS.userProfile(userId));
        if (!existing) return response.notFound(res, 'User not found');

        const requesterCollegeId = req.user?.collegeId || null;
        const isSuperAdmin = req.user?.isSuperAdmin === true;
        if (!isSuperAdmin) {
            if (!requesterCollegeId) return response.error(res, 'Missing collegeId', 400);
            if (existing.collegeId !== requesterCollegeId) return response.forbidden(res, 'Access denied');
        }

        const patch = {};
        ['firstName', 'lastName', 'phone', 'isActive'].forEach((k) => {
            if (req.body[k] !== undefined) patch[k] = req.body[k];
        });

        const updates = {};
        if (Object.keys(patch).length > 0) {
            updates[PATHS.userProfile(userId)] = { ...existing, ...patch };
        }

        // Student-specific updates
        if (existing.role === 'student') {
            const collegeId = existing.collegeId;
            const studentInfoPath = PATHS.collegeStudentsInfo(collegeId, userId);
            const studentInfo = await readVal(studentInfoPath) || {};

            const studentPatch = {};
            if (req.body.classId !== undefined) studentPatch.classId = req.body.classId;
            if (req.body.rollNumber !== undefined) studentPatch.rollNumber = req.body.rollNumber;
            if (req.body.isActive !== undefined) studentPatch.isActive = req.body.isActive;
            if (req.body.firstName !== undefined) studentPatch.firstName = req.body.firstName;
            if (req.body.lastName !== undefined) studentPatch.lastName = req.body.lastName;
            if (req.body.phone !== undefined) studentPatch.phone = req.body.phone;

            if (Object.keys(studentPatch).length > 0) {
                updates[studentInfoPath] = { ...studentInfo, ...studentPatch };
            }

            // Move class roster index
            if (req.body.classId && req.body.classId !== studentInfo.classId) {
                updates[`${PATHS.classStudents(collegeId, studentInfo.classId)}/${userId}`] = null;
                updates[`${PATHS.classStudents(collegeId, req.body.classId)}/${userId}`] = true;
            }
        }

        // Teacher-specific
        if (existing.role === 'teacher') {
            const collegeId = existing.collegeId;
            const teacherInfoPath = PATHS.collegeTeachersInfo(collegeId, userId);
            const teacherInfo = await readVal(teacherInfoPath) || {};
            const teacherPatch = {};
            ['firstName', 'lastName', 'phone', 'isActive'].forEach((k) => {
                if (req.body[k] !== undefined) teacherPatch[k] = req.body[k];
            });
            if (Object.keys(teacherPatch).length > 0) {
                updates[teacherInfoPath] = { ...teacherInfo, ...teacherPatch };
            }
        }

        if (Object.keys(updates).length === 0) return response.error(res, 'No changes provided', 400);
        await rtdb().ref().update(updates);

        await req.audit('UPDATE_USER', 'user', userId, existing, patch);
        return response.success(res, null, 'User updated');
    } catch (error) {
        console.error('Update user error:', error);
        return response.serverError(res, 'Failed to update user');
    }
};

exports.resetUserPassword = async (req, res) => {
    try {
        const { userId } = req.params;
        const { newPassword } = req.body;

        const existing = await readVal(PATHS.userProfile(userId));
        if (!existing) return response.notFound(res, 'User not found');

        const requesterCollegeId = req.user?.collegeId || null;
        const isSuperAdmin = req.user?.isSuperAdmin === true;
        if (!isSuperAdmin) {
            if (!requesterCollegeId) return response.error(res, 'Missing collegeId', 400);
            if (existing.collegeId !== requesterCollegeId) return response.forbidden(res, 'Access denied');
        }

        await auth().updateUser(userId, { password: newPassword });
        await req.audit('RESET_PASSWORD', 'user', userId);
        return response.success(res, null, 'Password reset');
    } catch (error) {
        console.error('Reset password error:', error);
        return response.serverError(res, 'Failed to reset password');
    }
};

// ==================== TEACHER ASSIGNMENTS ====================

exports.getTeacherAssignments = async (req, res) => {
    try {
        const { teacherId } = req.params;
        const requestedCollegeId = req.query.collegeId;
        if (requestedCollegeId && req.user?.isSuperAdmin !== true) {
            return response.forbidden(res, 'Access denied');
        }

        const collegeId = (requestedCollegeId ? requestedCollegeId : req.user?.collegeId);
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const teacherProfile = await readVal(PATHS.userProfile(teacherId));
        if (!teacherProfile) return response.notFound(res, 'Teacher not found');
        if (req.user?.isSuperAdmin !== true && teacherProfile.collegeId !== collegeId) {
            return response.forbidden(res, 'Access denied');
        }

        const assignments = await readVal(PATHS.teacherAssignments(collegeId, teacherId)) || {};
        const list = Object.entries(assignments).map(([assignmentId, a]) => ({ id: assignmentId, assignmentId, ...a }));
        return response.success(res, list);
    } catch (error) {
        console.error('Get teacher assignments error:', error);
        return response.serverError(res, 'Failed to fetch assignments');
    }
};

exports.assignTeacher = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { teacherId, classId, subjectId, academicYear } = req.body;

        const teacherProfile = await readVal(PATHS.userProfile(teacherId));
        if (!teacherProfile) return response.notFound(res, 'Teacher not found');
        if (teacherProfile.collegeId !== collegeId) return response.forbidden(res, 'Access denied');
        if (teacherProfile.role !== 'teacher') return response.error(res, 'Target user is not a teacher', 400);

        const assignmentId = uuidv4();
        const nowMs = Date.now();
        const payload = {
            assignmentId,
            teacherId,
            classId,
            subjectId,
            academicYear: academicYear || null,
            isActive: true,
            is_active: true,
            assignedAt: new Date(nowMs).toISOString(),
            assignedAtMs: nowMs,
            assigned_at_ms: nowMs,
            created_at_ms: nowMs
        };

        await rtdb().ref(PATHS.teacherAssignment(collegeId, teacherId, assignmentId)).set(payload);
        await req.audit('ASSIGN_TEACHER', 'teacher_assignment', assignmentId, null, payload);
        return response.created(res, { id: assignmentId }, 'Teacher assigned');
    } catch (error) {
        console.error('Assign teacher error:', error);
        return response.serverError(res, 'Failed to assign teacher');
    }
};

exports.removeTeacherAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;

        const requestedCollegeId = req.query.collegeId;
        if (requestedCollegeId && req.user?.isSuperAdmin !== true) {
            return response.forbidden(res, 'Access denied');
        }

        const collegeId = (requestedCollegeId ? requestedCollegeId : req.user?.collegeId);
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        // We store assignments under colleges/{collegeId}/teacher_assignments/{teacherUid}/{assignmentId}
        // Without an index, best-effort scan within this college only.
        const root = await readVal(PATHS.teacherAssignmentsRoot(collegeId)) || {};
        for (const [teacherUid, assignments] of Object.entries(root)) {
            if (!assignments || typeof assignments !== 'object') continue;
            if (assignments[assignmentId]) {
                await rtdb().ref(PATHS.teacherAssignment(collegeId, teacherUid, assignmentId)).remove();
                await req.audit('REMOVE_TEACHER_ASSIGNMENT', 'teacher_assignment', assignmentId);
                return response.success(res, null, 'Assignment removed');
            }
        }

        return response.notFound(res, 'Assignment not found');
    } catch (error) {
        console.error('Remove assignment error:', error);
        return response.serverError(res, 'Failed to remove assignment');
    }
};

function cryptoRandomPassword() {
    // Simple random base36 password; caller can supply their own password.
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
