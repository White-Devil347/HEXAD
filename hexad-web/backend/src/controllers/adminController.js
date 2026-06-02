const { v4: uuidv4 } = require('uuid');
const { rtdb } = require('../firebase/firebase');
const { response } = require('../utils');

const readVal = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.val();
};

const PATHS = {
    colleges: () => 'colleges',
    collegeInfo: (collegeId) => `colleges/${collegeId}/info`,
    departments: (collegeId) => `colleges/${collegeId}/departments`,
    department: (collegeId, departmentId) => `colleges/${collegeId}/departments/${departmentId}`,
    classes: (collegeId) => `colleges/${collegeId}/classes`,
    class: (collegeId, classId) => `colleges/${collegeId}/classes/${classId}`,
    subjects: (collegeId) => `colleges/${collegeId}/subjects`,
    subject: (collegeId, subjectId) => `colleges/${collegeId}/subjects/${subjectId}`,
    classSubjects: (collegeId, classId) => `colleges/${collegeId}/class_subjects/${classId}`
};

const normalizeInfoNode = (node) => {
    if (!node) return null;
    if (node && typeof node === 'object' && node.info && typeof node.info === 'object') return node.info;
    return node;
};

const getUpdateTarget = (node, basePath) => {
    if (node && typeof node === 'object' && node.info && typeof node.info === 'object') {
        return `${basePath}/info`;
    }
    return basePath;
};

const paginateArray = (items, page, limit) => {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const offset = (p - 1) * l;
    return { page: p, limit: l, total: items.length, items: items.slice(offset, offset + l) };
};

// ==================== COLLEGES ====================

exports.getColleges = async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const colleges = await readVal(PATHS.colleges()) || {};

        const list = Object.entries(colleges)
            .map(([collegeId, c]) => ({
                id: collegeId,
                ...(c?.info || {})
            }))
            .filter((c) => {
                if (!search) return true;
                const s = String(search).toLowerCase();
                return String(c.name || '').toLowerCase().includes(s) || String(c.code || '').toLowerCase().includes(s);
            })
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        const paged = paginateArray(list, page, limit);
        return response.paginatedResponse(res, paged.items, paged.total, paged.page, paged.limit);
    } catch (error) {
        console.error('Get colleges error:', error);
        return response.serverError(res, 'Failed to fetch colleges');
    }
};

exports.createCollege = async (req, res) => {
    try {
        const { name, code, address, contactEmail, contactPhone } = req.body;
        const collegeId = `college_${uuidv4().slice(0, 8)}`;
        const nowMs = Date.now();

        await rtdb().ref(PATHS.collegeInfo(collegeId)).set({
            name,
            code,
            address: address || null,
            contactEmail: contactEmail || null,
            contactPhone: contactPhone || null,
            isActive: true,
            created_at_ms: nowMs
        });

        await req.audit('CREATE_COLLEGE', 'college', collegeId, null, { name, code });

        return response.created(res, { id: collegeId }, 'College created');
    } catch (error) {
        console.error('Create college error:', error);
        return response.serverError(res, 'Failed to create college');
    }
};

exports.updateCollege = async (req, res) => {
    try {
        const { collegeId } = req.params;
        const patch = {};
        ['name', 'code', 'isActive'].forEach((k) => {
            if (req.body[k] !== undefined) patch[k] = req.body[k];
        });
        if (Object.keys(patch).length === 0) return response.error(res, 'No changes provided', 400);

        const ref = rtdb().ref(PATHS.collegeInfo(collegeId));
        const existing = await readVal(PATHS.collegeInfo(collegeId));
        if (!existing) return response.notFound(res, 'College not found');

        await ref.update(patch);
        await req.audit('UPDATE_COLLEGE', 'college', collegeId, existing, patch);

        return response.success(res, null, 'College updated');
    } catch (error) {
        console.error('Update college error:', error);
        return response.serverError(res, 'Failed to update college');
    }
};

// ==================== DEPARTMENTS ====================

exports.getDepartments = async (req, res) => {
    try {
        const requestedCollegeId = req.query.collegeId;
        if (requestedCollegeId && req.user?.isSuperAdmin !== true) {
            return response.forbidden(res, 'Access denied');
        }

        const collegeId = (requestedCollegeId ? requestedCollegeId : req.user.collegeId);
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { page = 1, limit = 20 } = req.query;
        const departments = await readVal(PATHS.departments(collegeId)) || {};
        const list = Object.entries(departments)
            .map(([departmentId, d]) => ({ id: departmentId, ...((normalizeInfoNode(d)) || {}) }))
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        const paged = paginateArray(list, page, limit);
        return response.paginatedResponse(res, paged.items, paged.total, paged.page, paged.limit);
    } catch (error) {
        console.error('Get departments error:', error);
        return response.serverError(res, 'Failed to fetch departments');
    }
};

exports.createDepartment = async (req, res) => {
    try {
        const requestedCollegeId = req.body.collegeId;
        if (requestedCollegeId && req.user?.isSuperAdmin !== true) {
            return response.forbidden(res, 'Access denied');
        }

        const collegeId = (requestedCollegeId ? requestedCollegeId : req.user.collegeId);
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { name, code } = req.body;
        const yearsCount = Number.isFinite(Number(req.body.yearsCount)) ? Number(req.body.yearsCount) : undefined;
        const departmentId = uuidv4();
        const nowMs = Date.now();

        const payload = {
            name,
            code,
            ...(yearsCount !== undefined ? { yearsCount } : {}),
            isActive: true,
            createdAt: new Date(nowMs).toISOString(),
            createdAtMs: nowMs,
            created_at_ms: nowMs
        };

        await rtdb().ref(PATHS.department(collegeId, departmentId)).set(payload);

        await req.audit('CREATE_DEPARTMENT', 'department', departmentId, null, { name, code, yearsCount: yearsCount ?? null, collegeId });

        return response.created(res, { id: departmentId }, 'Department created');
    } catch (error) {
        console.error('Create department error:', error);
        return response.serverError(res, 'Failed to create department');
    }
};

exports.updateDepartment = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { departmentId } = req.params;
        const patch = {};
        ['name', 'code', 'isActive', 'yearsCount'].forEach((k) => {
            if (req.body[k] !== undefined) patch[k] = req.body[k];
        });
        if (Object.keys(patch).length === 0) return response.error(res, 'No changes provided', 400);

        const raw = await readVal(PATHS.department(collegeId, departmentId));
        const existing = normalizeInfoNode(raw);
        if (!existing) return response.notFound(res, 'Department not found');

        const targetPath = getUpdateTarget(raw, PATHS.department(collegeId, departmentId));
        await rtdb().ref(targetPath).update(patch);
        await req.audit('UPDATE_DEPARTMENT', 'department', departmentId, existing, patch);
        return response.success(res, null, 'Department updated');
    } catch (error) {
        console.error('Update department error:', error);
        return response.serverError(res, 'Failed to update department');
    }
};

// ==================== CLASSES ====================

exports.getClasses = async (req, res) => {
    try {
        const requestedCollegeId = req.query.collegeId;
        if (requestedCollegeId && req.user?.isSuperAdmin !== true) {
            return response.forbidden(res, 'Access denied');
        }

        const collegeId = (requestedCollegeId ? requestedCollegeId : req.user.collegeId);
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { departmentId, page = 1, limit = 20 } = req.query;
        const classes = await readVal(PATHS.classes(collegeId)) || {};
        let list = Object.entries(classes).map(([classId, c]) => ({ id: classId, ...((normalizeInfoNode(c)) || {}) }));
        if (departmentId) list = list.filter((c) => c.departmentId === departmentId);
        list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        const paged = paginateArray(list, page, limit);
        return response.paginatedResponse(res, paged.items, paged.total, paged.page, paged.limit);
    } catch (error) {
        console.error('Get classes error:', error);
        return response.serverError(res, 'Failed to fetch classes');
    }
};

exports.createClass = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { departmentId, name, code, academicYear, semester } = req.body;
        const classId = uuidv4();
        const nowMs = Date.now();

        await rtdb().ref(PATHS.class(collegeId, classId)).set({
            departmentId,
            name,
            code,
            academicYear: academicYear || null,
            semester: semester ?? null,
            isActive: true,
            createdAt: new Date(nowMs).toISOString(),
            createdAtMs: nowMs,
            created_at_ms: nowMs
        });

        await req.audit('CREATE_CLASS', 'class', classId, null, { departmentId, name, code });
        return response.created(res, { id: classId }, 'Class created');
    } catch (error) {
        console.error('Create class error:', error);
        return response.serverError(res, 'Failed to create class');
    }
};

exports.updateClass = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { classId } = req.params;
        const patch = {};
        ['name', 'code', 'academicYear', 'semester', 'isActive'].forEach((k) => {
            if (req.body[k] !== undefined) patch[k] = req.body[k];
        });
        if (Object.keys(patch).length === 0) return response.error(res, 'No changes provided', 400);

        const raw = await readVal(PATHS.class(collegeId, classId));
        const existing = normalizeInfoNode(raw);
        if (!existing) return response.notFound(res, 'Class not found');

        const targetPath = getUpdateTarget(raw, PATHS.class(collegeId, classId));
        await rtdb().ref(targetPath).update(patch);
        await req.audit('UPDATE_CLASS', 'class', classId, existing, patch);
        return response.success(res, null, 'Class updated');
    } catch (error) {
        console.error('Update class error:', error);
        return response.serverError(res, 'Failed to update class');
    }
};

// ==================== SUBJECTS ====================

exports.getSubjects = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { departmentId, page = 1, limit = 20 } = req.query;
        const subjects = await readVal(PATHS.subjects(collegeId)) || {};
        let list = Object.entries(subjects).map(([subjectId, s]) => ({ id: subjectId, ...((normalizeInfoNode(s)) || {}) }));
        if (departmentId) list = list.filter((s) => s.departmentId === departmentId);
        list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        const paged = paginateArray(list, page, limit);
        return response.paginatedResponse(res, paged.items, paged.total, paged.page, paged.limit);
    } catch (error) {
        console.error('Get subjects error:', error);
        return response.serverError(res, 'Failed to fetch subjects');
    }
};

exports.createSubject = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { departmentId, name, code, credits } = req.body;
        const subjectId = uuidv4();
        const nowMs = Date.now();

        await rtdb().ref(PATHS.subject(collegeId, subjectId)).set({
            departmentId,
            name,
            code,
            credits: credits ?? null,
            classId: null,
            isActive: true,
            createdAt: new Date(nowMs).toISOString(),
            createdAtMs: nowMs,
            created_at_ms: nowMs
        });

        await req.audit('CREATE_SUBJECT', 'subject', subjectId, null, { departmentId, name, code });
        return response.created(res, { id: subjectId }, 'Subject created');
    } catch (error) {
        console.error('Create subject error:', error);
        return response.serverError(res, 'Failed to create subject');
    }
};

exports.assignSubjectToClass = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { classId, subjectId } = req.body;

        // Ensure class and subject exist
        const [cRaw, sRaw] = await Promise.all([
            readVal(PATHS.class(collegeId, classId)),
            readVal(PATHS.subject(collegeId, subjectId))
        ]);
        const cInfo = normalizeInfoNode(cRaw);
        const sInfo = normalizeInfoNode(sRaw);
        if (!cInfo) return response.notFound(res, 'Class not found');
        if (!sInfo) return response.notFound(res, 'Subject not found');

        await rtdb().ref(`${PATHS.classSubjects(collegeId, classId)}/${subjectId}`).set({
            assigned_at_ms: Date.now()
        });

        // Keep a direct pointer on the subject for clients that expect subject.classId
        const subjectTargetPath = getUpdateTarget(sRaw, PATHS.subject(collegeId, subjectId));
        await rtdb().ref(subjectTargetPath).update({ classId });

        await req.audit('ASSIGN_SUBJECT_TO_CLASS', 'class_subject', `${classId}:${subjectId}`, null, { classId, subjectId });
        return response.success(res, null, 'Subject assigned to class');
    } catch (error) {
        console.error('Assign subject error:', error);
        return response.serverError(res, 'Failed to assign subject');
    }
};
