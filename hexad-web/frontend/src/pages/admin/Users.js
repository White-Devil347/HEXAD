import React, { useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../services/api';
import { Copy, Edit, Search, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const getDisplayName = (u) => `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || u?.email || u?.uid || '';

const truncateUid = (uid) => {
    const s = String(uid || '');
    if (s.length <= 10) return s;
    return `${s.slice(0, 8)}...`;
};

const copyToClipboard = async (text) => {
    const value = String(text || '');
    if (!value) return;

    if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
};

const UserManagement = () => {
    const { isSuperAdmin } = useAuth();
    const toast = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
    const [dashboardStats, setDashboardStats] = useState(null);
    const [assignTeacher, setAssignTeacher] = useState(null);
    const [copiedUid, setCopiedUid] = useState(null);
    const [viewAssignmentsTeacher, setViewAssignmentsTeacher] = useState(null);
    const [assignmentCounts, setAssignmentCounts] = useState({});
    const [assignmentCache, setAssignmentCache] = useState({});
    const [classNameById, setClassNameById] = useState({});
    const [subjectNameById, setSubjectNameById] = useState({});
    const [departmentNameById, setDepartmentNameById] = useState({});
    const assignmentFetchInFlightRef = useRef({});

    useEffect(() => {
        // Lightweight best-effort: used to show student department names in the table.
        if (isSuperAdmin) return;

        let cancelled = false;
        const run = async () => {
            try {
                const res = await adminAPI.getDepartments({ limit: 200 });
                if (cancelled) return;
                const list = res?.data?.data || [];
                setDepartmentNameById(Object.fromEntries(list.map((d) => [d.id, d.name || d.code || d.id])));
            } catch (_) {
                // Best-effort only.
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [isSuperAdmin]);

    useEffect(() => {
        fetchUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pagination.page, roleFilter, appliedSearch]);

    useEffect(() => {
        const loadStats = async () => {
            try {
                const res = await adminAPI.getDashboard();
                setDashboardStats(res.data.data || null);
            } catch (_) {
                setDashboardStats(null);
            }
        };
        loadStats();
    }, []);

    const loadLookupsIfNeeded = async () => {
        // Keep it lightweight + cached; names are best-effort.
        try {
            const needClasses = Object.keys(classNameById).length === 0;
            const needSubjects = Object.keys(subjectNameById).length === 0;
            if (!needClasses && !needSubjects) return;

            const [classRes, subjectRes] = await Promise.all([
                needClasses ? adminAPI.getClasses({ limit: 100 }) : Promise.resolve(null),
                needSubjects ? adminAPI.getSubjects({ limit: 100 }) : Promise.resolve(null)
            ]);

            if (needClasses) {
                const classes = classRes?.data?.data || [];
                setClassNameById(Object.fromEntries(classes.map((c) => [c.id, c.name || c.code || c.id])));
            }
            if (needSubjects) {
                const subjects = subjectRes?.data?.data || [];
                setSubjectNameById(Object.fromEntries(subjects.map((s) => [s.id, s.name || s.code || s.id])));
            }
        } catch (e) {
            // If lookups fail, we can still show raw IDs.
        }
    };

    const fetchUsers = async (overrides = {}) => {
        setLoading(true);
        try {
            const page = overrides.page ?? pagination.page;
            const search = overrides.search ?? appliedSearch;

            const params = {
                page,
                limit: pagination.limit
            };
            if (roleFilter) params.role = roleFilter;
            if (search) params.search = search;

            const response = await adminAPI.getUsers(params);
            setUsers(response.data.data || []);
            setPagination(prev => ({ ...prev, total: response.data.pagination?.total || 0 }));
        } catch (error) {
            console.error('Failed to fetch users:', error);
            setUsers([]);
            setPagination(prev => ({ ...prev, total: 0 }));
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        setPagination(prev => ({ ...prev, page: 1 }));
        setAppliedSearch(searchInput.trim());
    };

    const handleRoleFilterChange = (e) => {
        setRoleFilter(e.target.value);
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    const setRoleFromBubble = (role) => {
        if (role === '__staff__') return; // placeholder for future
        setRoleFilter(role);
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    const compactStatCardStyle = { padding: '0.85rem 1rem' };
    const compactStatValueStyle = { fontSize: '1.35rem', marginTop: 0 };

    const getRoleBadge = (role) => {
        const badges = {
            super_admin: 'badge-danger',
            admin: 'badge-warning',
            teacher: 'badge-success',
            student: 'badge-info'
        };
        return badges[role] || 'badge-gray';
    };

    const formatRole = (role) => {
        if (!role) return 'Unknown';
        return String(role).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const getBusinessId = (u) => {
        const role = String(u?.role || '').toLowerCase();
        if (role === 'teacher') return u?.teacherId || u?.teacher_id || '-';
        if (role === 'student') return u?.studentId || u?.student_id || '-';
        return '-';
    };

    const getTeacherUid = (u) => u?.uid || u?.id || '';

    const getDepartmentId = (u) => u?.departmentId || u?.department_id || null;
    const getStudentDepartmentLabel = (u) => {
        const deptId = getDepartmentId(u);
        if (!deptId) return '-';
        return departmentNameById?.[deptId] || deptId;
    };

    const fetchTeacherAssignments = async (teacherUid) => {
        if (!teacherUid) return [];

        const existing = assignmentFetchInFlightRef.current?.[teacherUid];
        if (existing) return existing;

        const p = (async () => {
            const res = await adminAPI.getTeacherAssignments(teacherUid);
            const list = res?.data?.data || [];
            return Array.isArray(list) ? list : [];
        })();

        assignmentFetchInFlightRef.current[teacherUid] = p;
        try {
            return await p;
        } finally {
            delete assignmentFetchInFlightRef.current[teacherUid];
        }
    };

    const refreshTeacherAssignmentCount = async (teacherUid) => {
        if (!teacherUid) return;
        setAssignmentCounts((prev) => ({
            ...prev,
            [teacherUid]: { count: prev?.[teacherUid]?.count ?? 0, loading: true }
        }));
        try {
            const list = await fetchTeacherAssignments(teacherUid);
            const count = list.length;
            setAssignmentCache((prev) => ({ ...prev, [teacherUid]: list }));
            setAssignmentCounts((prev) => ({
                ...prev,
                [teacherUid]: { count, loading: false }
            }));
        } catch (e) {
            setAssignmentCounts((prev) => ({
                ...prev,
                [teacherUid]: { count: prev?.[teacherUid]?.count ?? 0, loading: false }
            }));
        }
    };

    useEffect(() => {
        // Efficient: only load counts for teachers on the current page, cache results.
        const teachers = users.filter((u) => String(u?.role || '').toLowerCase() === 'teacher');
        const teacherUids = teachers.map(getTeacherUid).filter(Boolean);
        const missing = teacherUids.filter((uid) => assignmentCounts?.[uid] === undefined);
        if (missing.length === 0) return;

        let cancelled = false;
        const concurrency = 4;
        const run = async () => {
            // mark all missing as loading
            setAssignmentCounts((prev) => {
                const next = { ...prev };
                missing.forEach((uid) => {
                    next[uid] = { count: 0, loading: true };
                });
                return next;
            });

            const queue = [...missing];
            const workers = new Array(concurrency).fill(null).map(async () => {
                while (queue.length > 0) {
                    const uid = queue.shift();
                    if (!uid) break;
                    try {
                        const list = await fetchTeacherAssignments(uid);
                        const count = list.length;
                        if (cancelled) return;
                        setAssignmentCache((prev) => ({ ...prev, [uid]: list }));
                        setAssignmentCounts((prev) => ({ ...prev, [uid]: { count, loading: false } }));
                    } catch (e) {
                        if (cancelled) return;
                        setAssignmentCounts((prev) => ({ ...prev, [uid]: { count: 0, loading: false } }));
                    }
                }
            });
            await Promise.all(workers);
        };

        run();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [users]);

    const handleCopyUid = async (uid) => {
        try {
            await copyToClipboard(uid);
            setCopiedUid(String(uid));
            window.setTimeout(() => {
                setCopiedUid((curr) => (curr === String(uid) ? null : curr));
            }, 1200);
        } catch (e) {
            toast.error('Failed to copy ID');
        }
    };

    const hasUsers = users.length > 0;

    if (loading && !hasUsers) {
        return (
            <div className="loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">User Management</h1>
                <div className="flex-center gap-2">
                    <button className="btn btn-success" onClick={() => setShowImportModal(true)}>
                        Import
                    </button>
                    <button className="btn btn-primary" onClick={() => { setEditingUser(null); setShowModal(true); }}>
                        <UserPlus size={16} /> Add User
                    </button>
                </div>
            </div>

            <div className="card mb-4">
                <form onSubmit={handleSearch} className="flex-center gap-4">
                    <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                        <div className="search-input-wrapper">
                            <Search size={18} className="search-icon" />
                            <input
                                type="text"
                                className="form-input search-input"
                                placeholder="Search by name, email, phone, or UID..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <select
                            className="form-input"
                            value={roleFilter}
                            onChange={handleRoleFilterChange}
                        >
                            <option value="">All Roles</option>
                            <option value="admin">Admin</option>
                            <option value="teacher">Teacher</option>
                            <option value="student">Student</option>
                        </select>
                    </div>
                    <button type="submit" className="btn btn-primary">
                        Search
                    </button>
                </form>
            </div>

            <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                <div
                    className="stat-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => setRoleFromBubble('admin')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setRoleFromBubble('admin'); }}
                    style={{
                        ...compactStatCardStyle,
                        ...(roleFilter === 'admin' ? { outline: '2px solid var(--primary)', outlineOffset: 2 } : {})
                    }}
                    aria-label="Filter Admin users"
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Admin</div>
                            <div className="stat-value" style={compactStatValueStyle}>{dashboardStats?.users?.admins ?? '-'}</div>
                        </div>
                    </div>
                </div>

                <div
                    className="stat-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => setRoleFromBubble('teacher')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setRoleFromBubble('teacher'); }}
                    style={{
                        ...compactStatCardStyle,
                        ...(roleFilter === 'teacher' ? { outline: '2px solid var(--primary)', outlineOffset: 2 } : {})
                    }}
                    aria-label="Filter Teacher users"
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Teachers</div>
                            <div className="stat-value" style={compactStatValueStyle}>{dashboardStats?.users?.teachers ?? '-'}</div>
                        </div>
                    </div>
                </div>

                <div
                    className="stat-card"
                    aria-label="Departments"
                    style={{ ...compactStatCardStyle }}
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Departments</div>
                            <div className="stat-value" style={compactStatValueStyle}>{dashboardStats?.counts?.departments ?? '-'}</div>
                        </div>
                    </div>
                </div>

                <div
                    className="stat-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => setRoleFromBubble('student')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setRoleFromBubble('student'); }}
                    style={{
                        ...compactStatCardStyle,
                        ...(roleFilter === 'student' ? { outline: '2px solid var(--primary)', outlineOffset: 2 } : {})
                    }}
                    aria-label="Filter Student users"
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Students</div>
                            <div className="stat-value" style={compactStatValueStyle}>{dashboardStats?.users?.students ?? '-'}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>{isSuperAdmin ? 'UID' : 'ID'}</th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Department</th>
                                <th>Assignments</th>
                                <th>Phone</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="9" className="text-center">Loading...</td>
                                </tr>
                            ) : users.length > 0 ? (
                                users.map((user) => (
                                    <tr key={user.id || user.uid}>
                                        <td>
                                            <div className="flex-center gap-1" style={{ whiteSpace: 'nowrap' }}>
                                                {isSuperAdmin ? (
                                                    <>
                                                        <code title={user.uid || user.id || ''}>{truncateUid(user.uid || user.id || '')}</code>
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-outline"
                                                            style={{ padding: '0.25rem 0.5rem' }}
                                                            onClick={() => handleCopyUid(user.uid || user.id || '')}
                                                            title="Copy UID"
                                                            aria-label="Copy UID"
                                                        >
                                                            <Copy size={14} />
                                                        </button>
                                                        {copiedUid === String(user.uid || user.id || '') && (
                                                            <span className="text-gray" style={{ fontSize: '0.75rem' }}>Copied</span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <code title={getBusinessId(user)}>{getBusinessId(user)}</code>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex-center gap-2">
                                                <div className="avatar">
                                                    {getDisplayName(user).charAt(0).toUpperCase()}
                                                </div>
                                                {getDisplayName(user)}
                                            </div>
                                        </td>
                                        <td>{user.email || '-'}</td>
                                        <td>
                                            <span className={`badge ${getRoleBadge(user.role)}`}>
                                                {formatRole(user.role)}
                                            </span>
                                        </td>
                                        <td>
                                            {String(user?.role || '').toLowerCase() === 'student'
                                                ? getStudentDepartmentLabel(user)
                                                : <span className="text-gray">-</span>}
                                        </td>
                                        <td>
                                            {String(user?.role || '').toLowerCase() === 'teacher' ? (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline"
                                                    style={{ whiteSpace: 'nowrap' }}
                                                    onClick={async () => {
                                                        await loadLookupsIfNeeded();
                                                        setViewAssignmentsTeacher(user);
                                                    }}
                                                    title="View assignments"
                                                >
                                                    {assignmentCounts?.[getTeacherUid(user)]?.loading
                                                        ? 'Loading...'
                                                        : `${assignmentCounts?.[getTeacherUid(user)]?.count || 0} Subjects Assigned`}
                                                </button>
                                            ) : (
                                                <span className="text-gray">-</span>
                                            )}
                                        </td>
                                        <td>{user.phone || '-'}</td>
                                        <td>
                                            <span className={`badge ${user.isActive !== false ? 'badge-success' : 'badge-danger'}`}>
                                                {user.isActive !== false ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex-center gap-1">
                                                {user.role === 'teacher' && (
                                                    <button
                                                        className="btn btn-sm btn-outline"
                                                        onClick={() => setAssignTeacher(user)}
                                                        title="Assign Subject"
                                                    >
                                                        Assign Subject
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-sm btn-outline"
                                                    onClick={() => { setEditingUser(user); setShowModal(true); }}
                                                    title="Edit"
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="9" className="text-center">
                                        No users found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {pagination.total > pagination.limit && (
                    <div className="pagination">
                        <button
                            className="btn btn-sm btn-outline"
                            disabled={loading || pagination.page === 1}
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                        >
                            Previous
                        </button>
                        <span>
                            Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
                        </span>
                        <button
                            className="btn btn-sm btn-outline"
                            disabled={loading || pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {showModal && (
                <UserModal
                    user={editingUser}
                    onClose={() => { setShowModal(false); setEditingUser(null); }}
                    onSuccess={(result) => {
                        setShowModal(false);
                        setEditingUser(null);
                        fetchUsers();

                        adminAPI.getDashboard().then((res) => setDashboardStats(res.data.data || null)).catch(() => {});

                        if (result?.createdTeacher) {
                            setAssignTeacher(result.createdTeacher);
                        }
                    }}
                />
            )}

            {showImportModal && (
                <BulkImportModal
                    onClose={() => setShowImportModal(false)}
                    onImported={() => {
                        setShowImportModal(false);
                        fetchUsers();
                        adminAPI.getDashboard().then((res) => setDashboardStats(res.data.data || null)).catch(() => {});
                    }}
                />
            )}

            {assignTeacher && (
                <TeacherAssignmentModal
                    teacher={assignTeacher}
                    onClose={() => setAssignTeacher(null)}
                    onSuccess={() => {
                        refreshTeacherAssignmentCount(getTeacherUid(assignTeacher));
                        setAssignTeacher(null);
                    }}
                />
            )}

            {viewAssignmentsTeacher && (
                <TeacherAssignmentsModal
                    teacher={viewAssignmentsTeacher}
                    initialAssignments={assignmentCache?.[getTeacherUid(viewAssignmentsTeacher)]}
                    classNameById={classNameById}
                    subjectNameById={subjectNameById}
                    fetchAssignmentsFn={fetchTeacherAssignments}
                    onClose={() => setViewAssignmentsTeacher(null)}
                    onCountUpdate={(teacherUid, count) => {
                        setAssignmentCounts((prev) => ({
                            ...prev,
                            [teacherUid]: { count: Number(count) || 0, loading: false }
                        }));
                    }}
                    onCacheUpdate={(teacherUid, list) => {
                        if (!teacherUid) return;
                        if (!Array.isArray(list)) return;
                        setAssignmentCache((prev) => ({ ...prev, [teacherUid]: list }));
                    }}
                />
            )}
        </div>
    );
};

const UserModal = ({ user, onClose, onSuccess }) => {
    const [departments, setDepartments] = useState([]);
    const [classes, setClasses] = useState([]);
    const toast = useToast();
    const [formData, setFormData] = useState({
        email: user?.email || '',
        password: '',
        role: user?.role || 'teacher',
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        phone: user?.phone || '',
        isActive: user?.isActive !== false,
        departmentId: user?.departmentId || '',
        classId: user?.classId || '',
        rollNumber: user?.rollNumber || '',
        teacherId: user?.teacherId || '',
        studentId: user?.studentId || ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [loadingDepartments, setLoadingDepartments] = useState(false);
    const [loadingClasses, setLoadingClasses] = useState(false);

    useEffect(() => {
        // Only needed when creating a student (hierarchical Department -> Class).
        if (user) return;
        if (String(formData.role) !== 'student') return;

        let cancelled = false;
        const loadDepartments = async () => {
            setLoadingDepartments(true);
            try {
                const res = await adminAPI.getDepartments({ limit: 200 });
                if (cancelled) return;
                setDepartments(res.data.data || []);
            } catch (e) {
                if (cancelled) return;
                setDepartments([]);
            } finally {
                if (cancelled) return;
                setLoadingDepartments(false);
            }
        };

        loadDepartments();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, formData.role]);

    useEffect(() => {
        // Editing an existing student still needs the class list.
        if (!user) return;
        if (String(formData.role) !== 'student') return;

        let cancelled = false;
        const loadClasses = async () => {
            setLoadingClasses(true);
            try {
                const res = await adminAPI.getClasses({ limit: 200 });
                if (cancelled) return;
                setClasses(res.data.data || []);
            } catch (e) {
                if (cancelled) return;
                setClasses([]);
            } finally {
                if (cancelled) return;
                setLoadingClasses(false);
            }
        };

        loadClasses();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, formData.role]);

    useEffect(() => {
        // Load classes filtered by selected department.
        if (user) return;
        if (String(formData.role) !== 'student') return;
        if (!formData.departmentId) {
            setClasses([]);
            setFormData((prev) => ({ ...prev, classId: '' }));
            return;
        }

        let cancelled = false;
        const loadClasses = async () => {
            setLoadingClasses(true);
            try {
                const res = await adminAPI.getClasses({ limit: 200, departmentId: formData.departmentId });
                if (cancelled) return;
                setClasses(res.data.data || []);
            } catch (e) {
                if (cancelled) return;
                setClasses([]);
            } finally {
                if (cancelled) return;
                setLoadingClasses(false);
            }
        };

        loadClasses();
        setFormData((prev) => ({ ...prev, classId: '' }));

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, formData.role, formData.departmentId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (user) {
                await adminAPI.updateUser(user.id || user.uid, {
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    phone: formData.phone,
                    isActive: formData.isActive,
                    ...(formData.role === 'student' ? { classId: formData.classId, rollNumber: formData.rollNumber } : {})
                });
                onSuccess();
            } else {
                if (formData.role === 'teacher') {
                    const created = await adminAPI.createTeacher({
                        email: formData.email,
                        password: formData.password,
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        phone: formData.phone,
                        ...(formData.teacherId ? { teacherId: formData.teacherId } : {})
                    });

                    const createdTeacherId = created?.data?.data?.id || created?.data?.data?.uid;
                    onSuccess({
                        createdTeacher: {
                            id: createdTeacherId,
                            uid: createdTeacherId,
                            role: 'teacher',
                            firstName: formData.firstName,
                            lastName: formData.lastName,
                            email: formData.email,
                            phone: formData.phone
                        }
                    });
                } else if (formData.role === 'student') {
                    await adminAPI.createStudent({
                        email: formData.email,
                        password: formData.password,
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        phone: formData.phone,
                        departmentId: formData.departmentId,
                        classId: formData.classId,
                        ...(formData.rollNumber ? { rollNumber: formData.rollNumber } : {}),
                        ...(formData.studentId ? { studentId: formData.studentId } : {})
                    });
                    onSuccess();
                } else {
                    throw new Error('Only teacher/student creation is supported in this panel');
                }
            }
        } catch (error) {
                toast.error(error.response?.data?.message || error.message || 'Failed to save user');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h3 className="modal-title">{user ? 'Edit User' : 'Add New User'}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-2 gap-4">
                        <div className="form-group">
                            <label className="form-label">First Name *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.firstName}
                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Last Name</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.lastName}
                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-2 gap-4">
                        <div className="form-group">
                            <label className="form-label">Email *</label>
                            <input
                                type="email"
                                className="form-input"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                                disabled={Boolean(user)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Phone</label>
                            <input
                                type="tel"
                                className="form-input"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                    </div>

                    {!user && (
                        <div className="form-group">
                            <label className="form-label">Password *</label>
                            <input
                                type="password"
                                className="form-input"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                required
                                minLength={6}
                            />
                        </div>
                    )}

                    {!user && formData.role === 'teacher' && (
                        <div className="form-group">
                            <label className="form-label">Teacher ID (optional)</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.teacherId}
                                onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
                                placeholder="TCH-001"
                            />
                            <small className="text-gray">Leave blank to auto-generate sequential ID.</small>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Role *</label>
                        <select
                            className="form-input"
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            required
                            disabled={Boolean(user)}
                        >
                            <option value="teacher">Teacher</option>
                            <option value="student">Student</option>
                        </select>
                        {user && <small className="text-gray">Role changes are not supported here.</small>}
                    </div>

                    {formData.role === 'student' && !user && (
                        <>
                            <div className="form-group">
                                <label className="form-label">Department *</label>
                                <select
                                    className="form-input"
                                    value={formData.departmentId}
                                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                                    required
                                    disabled={loadingDepartments}
                                >
                                    <option value="">Select Department</option>
                                    {departments.map((d) => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">Class *</label>
                                    <select
                                        className="form-input"
                                        value={formData.classId}
                                        onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                                        required
                                        disabled={loadingClasses || !formData.departmentId}
                                    >
                                        <option value="">Select Class</option>
                                        {classes.map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    {!formData.departmentId && <small className="text-gray">Select a department first.</small>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Roll Number (optional)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.rollNumber}
                                        onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {formData.role === 'student' && user && (
                        <div className="grid grid-2 gap-4">
                            <div className="form-group">
                                <label className="form-label">Class</label>
                                <select
                                    className="form-input"
                                    value={formData.classId}
                                    onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                                    disabled={loadingClasses}
                                >
                                    <option value="">Select Class</option>
                                    {classes.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Roll Number</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.rollNumber}
                                    onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    {!user && formData.role === 'student' && (
                        <div className="form-group">
                            <label className="form-label">Student ID (optional)</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.studentId}
                                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                                placeholder="STD-001"
                            />
                            <small className="text-gray">Leave blank to auto-generate sequential ID.</small>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="flex-center gap-2">
                            <input
                                type="checkbox"
                                checked={formData.isActive}
                                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                            />
                            Active User
                        </label>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Saving...' : user ? 'Update User' : 'Create User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const BulkImportModal = ({ onClose, onImported }) => {
    const toast = useToast();
    const { isSuperAdmin } = useAuth();

    const [target, setTarget] = useState('');
    const [showFormat, setShowFormat] = useState(false);

    const [departments, setDepartments] = useState([]);
    const [classes, setClasses] = useState([]);
    const [departmentId, setDepartmentId] = useState('');
    const [classId, setClassId] = useState('');
    const [loadingDepartments, setLoadingDepartments] = useState(false);
    const [loadingClasses, setLoadingClasses] = useState(false);
    const [collegeId, setCollegeId] = useState('');

    const [fileName, setFileName] = useState('');

    const [rows, setRows] = useState([]);
    const [parseError, setParseError] = useState('');
    const [validationErrors, setValidationErrors] = useState([]);
    const [invalidRowSet, setInvalidRowSet] = useState(() => new Set());
    const [importing, setImporting] = useState(false);
    const [importPhase, setImportPhase] = useState('');
    const [result, setResult] = useState(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    useEffect(() => {
        setParseError('');
        setValidationErrors([]);
        setInvalidRowSet(new Set());
        setRows([]);
        setResult(null);
        setImportPhase('');
        setShowFormat(false);
    }, [target]);

    useEffect(() => {
        if (target !== 'students') return;

        let cancelled = false;
        const loadDepartments = async () => {
            setLoadingDepartments(true);
            try {
                const res = await adminAPI.getDepartments({ limit: 200 });
                if (cancelled) return;
                setDepartments(res.data.data || []);
            } catch (e) {
                if (cancelled) return;
                setDepartments([]);
            } finally {
                if (cancelled) return;
                setLoadingDepartments(false);
            }
        };

        loadDepartments();
        return () => {
            cancelled = true;
        };
    }, [target]);

    useEffect(() => {
        if (target !== 'students') return;
        if (!departmentId) {
            setClasses([]);
            setClassId('');
            return;
        }

        let cancelled = false;
        const loadClasses = async () => {
            setLoadingClasses(true);
            try {
                const res = await adminAPI.getClasses({ limit: 200, departmentId });
                if (cancelled) return;
                setClasses(res.data.data || []);
            } catch (e) {
                if (cancelled) return;
                setClasses([]);
            } finally {
                if (cancelled) return;
                setLoadingClasses(false);
            }
        };

        loadClasses();
        setClassId('');
        return () => {
            cancelled = true;
        };
    }, [target, departmentId]);

    const sanitizeTeacherRow = (raw) => {
        const r = raw && typeof raw === 'object' ? raw : {};
        return {
            email: String(r.email || '').trim(),
            firstName: String(r.firstName || '').trim(),
            lastName: String(r.lastName || '').trim(),
            phone: String(r.phone || '').trim(),
            teacherId: String(r.teacherId || '').trim(),
            password: String(r.password || '').trim()
        };
    };

    const sanitizeStudentRow = (raw) => {
        const r = raw && typeof raw === 'object' ? raw : {};
        return {
            email: String(r.email || '').trim(),
            firstName: String(r.firstName || '').trim(),
            lastName: String(r.lastName || '').trim(),
            phone: String(r.phone || '').trim(),
            rollNumber: String(r.rollNumber || '').trim(),
            enrollmentYear: r.enrollmentYear === undefined || r.enrollmentYear === null ? '' : String(r.enrollmentYear).trim(),
            studentId: String(r.studentId || '').trim(),
            password: String(r.password || '').trim()
        };
    };

    const parseCSV = (text) => {
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
            if (row.length === 1 && String(row[0] || '').trim() === '' && out.length > 0) {
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
                // ignore CR; LF will handle row end
                continue;
            }

            cell += ch;
        }

        pushCell();
        if (row.length > 0) pushRow();
        return out;
    };

    const validateRows = (list) => {
        const errs = [];
        const invalid = new Set();
        const emailToIndex = new Map();

        const ensureRequired = (value, rowNum, index, field, message) => {
            if (!value) {
                errs.push({ index, row: rowNum, field, message });
                invalid.add(index);
                return false;
            }
            return true;
        };

        for (let i = 0; i < list.length; i += 1) {
            const r = list[i] || {};
            const rowNum = i + 1;

            ensureRequired(r.email, rowNum, i, 'email', 'Email is required');
            if (r.email && !emailRegex.test(r.email)) {
                errs.push({ index: i, row: rowNum, field: 'email', message: 'Invalid email' });
                invalid.add(i);
            }

            if (target === 'teachers') {
                ensureRequired(r.firstName, rowNum, i, 'firstName', 'First name is required');
                ensureRequired(r.lastName, rowNum, i, 'lastName', 'Last name is required');
            }
            if (target === 'students') {
                ensureRequired(r.firstName, rowNum, i, 'firstName', 'First name is required');
                ensureRequired(r.lastName, rowNum, i, 'lastName', 'Last name is required');
                if (r.enrollmentYear) {
                    const y = Number(r.enrollmentYear);
                    if (!Number.isFinite(y) || !Number.isInteger(y)) {
                        errs.push({ index: i, row: rowNum, field: 'enrollmentYear', message: 'enrollmentYear must be an integer' });
                        invalid.add(i);
                    }
                }
            }

            const emailKey = String(r.email || '').trim().toLowerCase();
            if (emailKey) {
                const existing = emailToIndex.get(emailKey);
                if (existing !== undefined) {
                    errs.push({ index: i, row: rowNum, field: 'email', message: `Duplicate email in file (also row ${existing + 1})` });
                    errs.push({ index: existing, row: existing + 1, field: 'email', message: `Duplicate email in file (also row ${rowNum})` });
                    invalid.add(i);
                    invalid.add(existing);
                } else {
                    emailToIndex.set(emailKey, i);
                }
            }
        }

        // de-duplicate error objects (same row/field/message)
        const uniq = new Map();
        errs.forEach((e) => {
            const k = `${e.index}::${e.field}::${e.message}`;
            if (!uniq.has(k)) uniq.set(k, e);
        });

        return { errors: Array.from(uniq.values()), invalidRows: invalid };
    };

    const handleFile = async (file) => {
        setResult(null);
        setParseError('');
        setValidationErrors([]);
        setInvalidRowSet(new Set());
        setRows([]);
        setImportPhase('');

        if (!file) return;

        if (!target) {
            setFileName(file.name || '');
            setParseError('Select Import Target before uploading a file.');
            return;
        }

        setFileName(file.name || '');

        try {
            const name = String(file.name || '').toLowerCase();
            const text = await file.text();

            let parsed = null;
            if (name.endsWith('.json')) {
                const json = JSON.parse(text);
                if (!Array.isArray(json)) {
                    setParseError('Invalid JSON structure. Expected a top-level array of users.');
                    return;
                }
                parsed = json;
            } else if (name.endsWith('.csv')) {
                const grid = parseCSV(text);
                if (!Array.isArray(grid) || grid.length < 2) {
                    setParseError('CSV must include a header row and at least 1 data row.');
                    return;
                }
                const header = grid[0].map((h) => String(h || '').trim());
                const headerIndex = new Map();
                header.forEach((h, idx) => {
                    if (h) headerIndex.set(h, idx);
                });

                const teacherRequired = ['email', 'firstName', 'lastName'];
                const studentRequired = ['email', 'firstName', 'lastName'];
                const requiredHeaders = target === 'teachers' ? teacherRequired : studentRequired;

                const missing = requiredHeaders.filter((h) => !headerIndex.has(h));
                if (missing.length > 0) {
                    setParseError(`Missing required CSV headers: ${missing.join(', ')}`);
                    return;
                }

                const known = target === 'teachers'
                    ? ['email', 'firstName', 'lastName', 'phone', 'teacherId', 'password']
                    : ['email', 'firstName', 'lastName', 'phone', 'rollNumber', 'enrollmentYear', 'studentId', 'password'];

                parsed = grid.slice(1).map((line) => {
                    const obj = {};
                    known.forEach((h) => {
                        if (headerIndex.has(h)) {
                            obj[h] = line[headerIndex.get(h)] ?? '';
                        }
                    });
                    return obj;
                });
            } else {
                setParseError('Unsupported file type. Upload a .json or .csv file.');
                return;
            }

            const nextRows = (Array.isArray(parsed) ? parsed : []).map((r) => (target === 'teachers' ? sanitizeTeacherRow(r) : sanitizeStudentRow(r)));
            setRows(nextRows);

            const { errors, invalidRows } = validateRows(nextRows);
            setValidationErrors(errors);
            setInvalidRowSet(invalidRows);
        } catch (e) {
            setParseError(e?.message || 'Failed to parse file');
            setImportPhase('');
        }
    };

    const downloadTextFile = (filename, content, mimeType) => {
        const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const handleDownloadSampleJSON = () => {
        if (target === 'teachers') {
            const payload = [
                {
                    email: 'teacher1@example.com',
                    firstName: 'Ajay',
                    lastName: 'Kumar',
                    phone: '9999999999'
                }
            ];
            downloadTextFile('hexad_teachers_sample.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
            return;
        }

        const payload = [
            {
                email: 'student1@example.com',
                firstName: 'Ajay',
                lastName: 'Kumar',
                rollNumber: '23CS001',
                enrollmentYear: 2025
            }
        ];
        downloadTextFile('hexad_students_sample.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    };

    const handleDownloadSampleCSV = () => {
        if (target === 'teachers') {
            const csv = [
                'email,firstName,lastName,phone',
                'teacher1@example.com,Ajay,Kumar,9999999999'
            ].join('\n');
            downloadTextFile('hexad_teachers_sample.csv', csv, 'text/csv;charset=utf-8');
            return;
        }

        const csv = [
            'email,firstName,lastName,rollNumber,enrollmentYear,phone',
            'student1@example.com,Ajay,Kumar,23CS001,2025,9999999999'
        ].join('\n');
        downloadTextFile('hexad_students_sample.csv', csv, 'text/csv;charset=utf-8');
    };

    const canImport = () => {
        if (!target) return false;
        if (!Array.isArray(rows) || rows.length === 0) return false;
        if (parseError) return false;
        if ((validationErrors || []).length > 0) return false;
        if (target === 'students' && (!departmentId || !classId)) return false;
        if (target === 'teachers' && isSuperAdmin && !String(collegeId || '').trim()) return false;
        return true;
    };

    const getImportBlockers = () => {
        const blockers = [];
        const hasRows = Array.isArray(rows) && rows.length > 0;
        const hasFile = Boolean(String(fileName || '').trim());

        if (!target) blockers.push('Select an Import Target (Students or Teachers).');
        if (!hasFile) blockers.push('Upload a .json or .csv file.');
        if (parseError) blockers.push(parseError);
        if (hasFile && !parseError && !hasRows) blockers.push('No rows detected in the file.');
        if (Array.isArray(validationErrors) && validationErrors.length > 0) blockers.push(`Fix validation issues in the file (${validationErrors.length} found).`);
        if (target === 'students' && (!departmentId || !classId)) blockers.push('Select Department and Class for student import.');
        if (target === 'teachers' && isSuperAdmin && !String(collegeId || '').trim()) blockers.push('Enter College ID for Super Admin teacher import.');

        return blockers;
    };

    const handleImport = async () => {
        if (!canImport()) return;
        setImporting(true);
        setResult(null);
        try {
            setImportPhase('Importing...');

            if (target === 'teachers') {
                const payload = {
                    teachers: rows.map((r) => ({
                        email: r.email,
                        firstName: r.firstName,
                        lastName: r.lastName,
                        phone: r.phone || undefined,
                        teacherId: r.teacherId || undefined,
                        password: r.password || undefined
                    }))
                };

                if (isSuperAdmin) {
                    payload.collegeId = String(collegeId || '').trim();
                }

                const res = await adminAPI.bulkImportTeachers(payload);
                const data = res?.data?.data || null;
                const inserted = data?.totalImported ?? 0;
                const failed = data?.totalFailed ?? 0;
                setResult({ total: rows.length, inserted, failed, results: data?.results || [] });
                toast.success(`Imported ${inserted} teachers (failed ${failed})`);
                return;
            }

            const res = await adminAPI.bulkImportStudents({
                students: rows.map((r) => ({
                    email: r.email,
                    firstName: r.firstName,
                    lastName: r.lastName,
                    phone: r.phone || undefined,
                    rollNumber: r.rollNumber || undefined,
                    enrollmentYear: r.enrollmentYear ? Number(r.enrollmentYear) : undefined,
                    studentId: r.studentId || undefined,
                    password: r.password || undefined,
                    departmentId,
                    classId
                }))
            });

            setImportPhase('Finalizing result...');

            const data = res?.data?.data || null;
            const inserted = data?.totalImported ?? 0;
            const failed = data?.totalFailed ?? 0;
            setResult({ total: rows.length, inserted, failed, results: data?.results || [] });
            toast.success(`Imported ${inserted} students (failed ${failed})`);
        } catch (e) {
            const msg = e?.response?.data?.message || e?.message || 'Import failed';
            const errs = e?.response?.data?.errors;
            toast.error(msg);
            if (Array.isArray(errs) && errs.length > 0) {
                setResult({ errorMessage: msg, errors: errs });
            } else {
                setResult({ errorMessage: msg });
            }
        } finally {
            setImportPhase('');
            setImporting(false);
        }
    };

    const renderErrors = (title, errs) => {
        if (!Array.isArray(errs) || errs.length === 0) return null;
        const shown = errs.slice(0, 10);
        return (
            <div className="mb-3">
                <div className="text-gray" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>{title}</div>
                <div className="card" style={{ padding: '0.75rem', background: 'var(--gray-50)' }}>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                        {shown.map((er, idx) => (
                            <li key={`${title}-${idx}`} style={{ marginBottom: '0.25rem' }}>
                                {er.index !== undefined ? `Row ${Number(er.index) + 1}: ` : ''}{er.message}{er.field ? ` (${er.field})` : ''}
                            </li>
                        ))}
                    </ul>
                    {errs.length > shown.length && (
                        <div className="text-gray" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                            Showing first {shown.length} of {errs.length}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderResult = () => {
        if (!result) return null;
        if (result.errorMessage) {
            return (
                <div className="mb-3">
                    <div className="text-gray" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>Server response</div>
                    <div className="card" style={{ padding: '0.75rem', border: '1px solid var(--gray-200)', borderLeft: '4px solid var(--danger)' }}>
                        <div style={{ fontWeight: 600, color: 'var(--danger)' }}>{result.errorMessage}</div>
                        {Array.isArray(result.errors) && result.errors.length > 0 && (
                            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                                {result.errors.slice(0, 10).map((er, idx) => (
                                    <li key={`srv-err-${idx}`}>{er.message || JSON.stringify(er)}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            );
        }

        const total = result?.total ?? 0;
        const inserted = result?.inserted ?? 0;
        const failed = result?.failed ?? 0;
        const failures = Array.isArray(result?.results) ? result.results.filter((r) => r && r.status === 'failed') : [];

        return (
            <div className="mb-3">
                <div className="text-gray" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>Import result</div>
                <div className="card" style={{ padding: '0.75rem' }}>
                    <div className="flex-between" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                        <div><strong>Total:</strong> {total}</div>
                        <div><strong>Inserted:</strong> {inserted}</div>
                        <div><strong>Failed:</strong> {failed}</div>
                    </div>
                    {failures.length > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                            <div className="text-gray" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>Failures (first 10)</div>
                            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                                {failures.slice(0, 10).map((f, idx) => (
                                    <li key={`fail-${idx}`}>{f.email || '-'}: {f.error || 'Failed'}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderPreview = () => {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const shown = rows.slice(0, 25);
        return (
            <div className="mb-3">
                <div className="text-gray" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>Preview (first {shown.length})</div>
                <div className="table-container card" style={{ padding: 0 }}>
                    <table className="table" style={{ margin: 0 }}>
                        <thead>
                            <tr>
                                <th style={{ width: 70 }}>Row</th>
                                <th>Email</th>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Phone</th>
                                {target === 'teachers' ? (
                                    <th>Teacher ID</th>
                                ) : (
                                    <>
                                        <th>Roll No.</th>
                                        <th>Enroll Year</th>
                                        <th>Student ID</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((r, idx) => {
                                const isInvalid = invalidRowSet.has(idx);
                                return (
                                    <tr key={`preview-${idx}`} style={isInvalid ? { background: 'rgba(239, 68, 68, 0.06)' } : undefined}>
                                        <td>{idx + 1}</td>
                                        <td>{r.email || '-'}</td>
                                        <td>{r.firstName || '-'}</td>
                                        <td>{r.lastName || '-'}</td>
                                        <td>{r.phone || '-'}</td>
                                        {target === 'teachers' ? (
                                            <td>{r.teacherId || '-'}</td>
                                        ) : (
                                            <>
                                                <td>{r.rollNumber || '-'}</td>
                                                <td>{r.enrollmentYear || '-'}</td>
                                                <td>{r.studentId || '-'}</td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {rows.length > shown.length && (
                    <div className="text-gray" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        Showing first {shown.length} of {rows.length}
                    </div>
                )}
            </div>
        );
    };

    const renderImportReadiness = () => {
        const blockers = getImportBlockers();
        const hasFileOrAttempt = Boolean(String(fileName || '').trim()) || parseError || (Array.isArray(rows) && rows.length > 0);
        if (!hasFileOrAttempt) return null;

        const can = blockers.length === 0;
        const border = can ? 'var(--success)' : 'var(--danger)';
        const title = can ? 'Import possible' : 'Import not possible';

        const details = can
            ? `Validated. Rows: ${rows.length}. ${target === 'students' ? 'Department/Class will be applied to all imported students.' : 'Ready to import teachers.'}`
            : blockers[0] || 'Fix the issues below to enable import.';

        return (
            <div className="mb-3">
                <div className="card" style={{ padding: '0.75rem', border: '1px solid var(--gray-200)', borderLeft: `4px solid ${border}` }}>
                    <div style={{ fontWeight: 600 }}>{title}</div>
                    {details ? <div className="text-gray" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>{details}</div> : null}
                    {!can && blockers.length > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                                {blockers.slice(0, 8).map((b, idx) => (
                                    <li key={`blk-${idx}`} style={{ marginBottom: '0.25rem' }}>{b}</li>
                                ))}
                            </ul>
                            {blockers.length > 8 && (
                                <div className="text-gray" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                    And {blockers.length - 8} more...
                                </div>
                            )}
                            {Array.isArray(validationErrors) && validationErrors.length > 0 && (
                                <div className="text-gray" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                    Open “Validation issues” below to see row-level errors.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 720, position: 'relative' }}>
                {importing && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(255, 255, 255, 0.86)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            zIndex: 5,
                            borderRadius: 'var(--radius)',
                            padding: '1rem'
                        }}
                        aria-live="polite"
                        aria-busy="true"
                    >
                        <div className="spinner" />
                        <div style={{ fontWeight: 600 }}>Importing...</div>
                        <div className="text-gray" style={{ fontSize: '0.875rem', textAlign: 'center' }}>
                            {importPhase || 'Working on your file...'}
                        </div>
                        <div className="text-gray" style={{ fontSize: '0.875rem' }}>
                            Rows: <strong>{Array.isArray(rows) ? rows.length : 0}</strong>
                        </div>
                    </div>
                )}
                <div className="modal-header">
                    <h3 className="modal-title">Bulk Import (JSON/CSV)</h3>
                    <button className="modal-close" onClick={onClose} disabled={importing}>&times;</button>
                </div>

                <div className="grid grid-2 gap-4 mb-3">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Import Target *</label>
                        <select
                            className="form-input"
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            disabled={importing}
                        >
                            <option value="">Select Target</option>
                            <option value="students">Students</option>
                            <option value="teachers">Teachers</option>
                        </select>
                    </div>

                    {target === 'teachers' && isSuperAdmin && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">College ID *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={collegeId}
                                onChange={(e) => setCollegeId(e.target.value)}
                                placeholder="COL001"
                                disabled={importing}
                            />
                            <small className="text-gray">Required for Super Admin teacher import.</small>
                        </div>
                    )}
                </div>

                {target === 'students' && (
                    <div className="grid grid-2 gap-4 mb-3">
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Department *</label>
                            <select
                                className="form-input"
                                value={departmentId}
                                onChange={(e) => setDepartmentId(e.target.value)}
                                disabled={importing || loadingDepartments}
                            >
                                <option value="">Select Department</option>
                                {departments.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Class *</label>
                            <select
                                className="form-input"
                                value={classId}
                                onChange={(e) => setClassId(e.target.value)}
                                disabled={importing || loadingClasses || !departmentId}
                            >
                                <option value="">Select Class</option>
                                {classes.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {target === 'students' && (
                    <div className="text-gray mb-3" style={{ fontSize: '0.875rem' }}>
                        Selected <strong>Department</strong> and <strong>Class</strong> will be applied to all imported student rows.
                    </div>
                )}

                <div className="card mb-3" style={{ padding: '0.75rem', background: 'var(--gray-50)' }}>
                    <div className="flex-between" style={{ gap: '0.75rem' }}>
                        <div style={{ fontWeight: 600 }}>Required formats</div>
                        <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => setShowFormat((v) => !v)}
                            disabled={importing || !target}
                        >
                            {showFormat ? 'Hide format' : 'View format'}
                        </button>
                    </div>

                    {!showFormat ? (
                        <div className="text-gray" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                            {target
                                ? <>Click <strong>View format</strong> to see the required JSON/CSV structure before uploading.</>
                                : <>Select an <strong>Import Target</strong> to view the correct format.</>
                            }
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-2 gap-4" style={{ marginTop: '0.75rem' }}>
                                <div>
                                    <div className="text-gray" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>JSON (array)</div>
                                    <pre
                                        style={{
                                            margin: 0,
                                            whiteSpace: 'pre-wrap',
                                            fontSize: '0.8rem',
                                            maxHeight: 160,
                                            overflowY: 'auto',
                                            padding: '0.5rem',
                                            borderRadius: 'var(--radius)',
                                            border: '1px solid var(--gray-200)',
                                            background: 'white'
                                        }}
                                    >
                                        {target === 'teachers'
                                            ? `[{\n  "email": "teacher1@example.com",\n  "firstName": "Ajay",\n  "lastName": "Kumar",\n  "phone": "9999999999"\n}]`
                                            : `[{\n  "email": "student1@example.com",\n  "firstName": "Ajay",\n  "lastName": "Kumar",\n  "rollNumber": "23CS001",\n  "enrollmentYear": 2025\n}]`}
                                    </pre>
                                </div>
                                <div>
                                    <div className="text-gray" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>CSV</div>
                                    <pre
                                        style={{
                                            margin: 0,
                                            whiteSpace: 'pre-wrap',
                                            fontSize: '0.8rem',
                                            maxHeight: 160,
                                            overflowY: 'auto',
                                            padding: '0.5rem',
                                            borderRadius: 'var(--radius)',
                                            border: '1px solid var(--gray-200)',
                                            background: 'white'
                                        }}
                                    >
                                        {target === 'teachers'
                                            ? `email,firstName,lastName,phone\nteacher1@example.com,Ajay,Kumar,9999999999`
                                            : `email,firstName,lastName,rollNumber,enrollmentYear,phone\nstudent1@example.com,Ajay,Kumar,23CS001,2025,9999999999`}
                                    </pre>
                                </div>
                            </div>
                            <div className="flex-center gap-2" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                <button type="button" className="btn btn-sm btn-outline" onClick={handleDownloadSampleJSON} disabled={importing}>
                                    Download sample JSON
                                </button>
                                <button type="button" className="btn btn-sm btn-outline" onClick={handleDownloadSampleCSV} disabled={importing}>
                                    Download sample CSV
                                </button>
                                <div className="text-gray" style={{ fontSize: '0.85rem' }}>
                                    Optional fields: <strong>phone</strong>, <strong>password</strong>, {target === 'teachers' ? <><strong>teacherId</strong></> : <><strong>rollNumber</strong>, <strong>enrollmentYear</strong>, <strong>studentId</strong></>}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="form-group">
                    <label className="form-label">Upload file (JSON/CSV) *</label>
                    <input
                        type="file"
                        accept="application/json,.json,text/csv,.csv"
                        className="form-input"
                        disabled={importing || !target}
                        onChange={(e) => handleFile(e.target.files?.[0] || null)}
                    />
                    {fileName && <small className="text-gray">Loaded: {fileName}</small>}
                    <small className="text-gray">
                        {target ? 'We validate locally before importing.' : 'Select Import Target first.'}
                    </small>
                </div>

                {renderImportReadiness()}

                {(parseError || (Array.isArray(rows) && rows.length > 0) || (Array.isArray(validationErrors) && validationErrors.length > 0)) && (
                    <div className="card mb-3" style={{ padding: '0.75rem' }}>
                        <div className="flex-between" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 600 }}>Validation & Preview</div>
                            <div className="text-gray" style={{ fontSize: '0.875rem' }}>
                                File: <strong>{fileName || '-'}</strong>{Array.isArray(rows) && rows.length > 0 ? <> · Rows: <strong>{rows.length}</strong></> : null}
                            </div>
                        </div>

                        {parseError && (
                            <div style={{ marginTop: '0.75rem' }}>
                                <div className="card" style={{ padding: '0.75rem', border: '1px solid var(--gray-200)', borderLeft: '4px solid var(--danger)', background: 'var(--gray-50)' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--danger)' }}>{parseError}</div>
                                </div>
                            </div>
                        )}

                        {Array.isArray(validationErrors) && validationErrors.length > 0 && (
                            <details style={{ marginTop: '0.75rem' }} open>
                                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                                    Validation issues ({validationErrors.length})
                                </summary>
                                <div style={{ marginTop: '0.5rem' }}>
                                    {renderErrors('Validation issues', validationErrors)}
                                </div>
                            </details>
                        )}

                        {Array.isArray(rows) && rows.length > 0 && (
                            <details style={{ marginTop: '0.75rem' }}>
                                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                                    Uploaded file preview
                                </summary>
                                <div style={{ marginTop: '0.5rem' }}>
                                    {renderPreview()}
                                </div>
                            </details>
                        )}
                    </div>
                )}
                {renderResult()}

                <div className="modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={importing}>
                        Close
                    </button>
                    {result && !importing ? (
                        <button type="button" className="btn btn-primary" onClick={onImported}>
                            Done
                        </button>
                    ) : (
                        <div className="flex-center" style={{ gap: '0.75rem' }}>
                            <button type="button" className="btn btn-primary" onClick={handleImport} disabled={importing || !canImport()}>
                                {importing ? 'Importing...' : 'Import'}
                            </button>
                            {!canImport() && (
                                <div className="text-gray" style={{ fontSize: '0.85rem' }}>
                                    Fix the issues above to enable import.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const TeacherAssignmentModal = ({ teacher, onClose, onSuccess }) => {
    const teacherId = teacher?.uid || teacher?.id;
    const toast = useToast();
    const [departments, setDepartments] = useState([]);
    const [classes, setClasses] = useState([]);
    const [subjects, setSubjects] = useState([]);

    const [departmentId, setDepartmentId] = useState('');
    const [classId, setClassId] = useState('');
    const [subjectId, setSubjectId] = useState('');
    const [academicYear, setAcademicYear] = useState('');

    const [loadingLists, setLoadingLists] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const loadDepartments = async () => {
            try {
                const res = await adminAPI.getDepartments({ limit: 200 });
                setDepartments(res.data.data || []);
            } catch (e) {
                setDepartments([]);
            }
        };

        loadDepartments();
    }, []);

    useEffect(() => {
        const loadLists = async () => {
            setLoadingLists(true);
            try {
                const params = { limit: 200, ...(departmentId ? { departmentId } : {}) };
                const [classRes, subjectRes] = await Promise.all([
                    adminAPI.getClasses(params),
                    adminAPI.getSubjects(params)
                ]);
                setClasses(classRes.data.data || []);
                setSubjects(subjectRes.data.data || []);
            } catch (e) {
                setClasses([]);
                setSubjects([]);
            } finally {
                setLoadingLists(false);
            }
        };

        loadLists();
        setClassId('');
        setSubjectId('');
    }, [departmentId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!teacherId) return toast.error('Missing teacher id');
        if (!classId) return toast.error('Please select a class');
        if (!subjectId) return toast.error('Please select a subject');

        setSubmitting(true);
        try {
            await adminAPI.assignTeacher({
                teacherId,
                classId,
                subjectId,
                academicYear: academicYear || undefined
            });
            toast.success('Assignment saved');
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || 'Failed to assign teacher');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h3 className="modal-title">Assign Subject</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="mb-4">
                    <div className="text-gray" style={{ fontSize: '0.875rem' }}>
                        Teacher: <strong>{getDisplayName(teacher) || teacherId}</strong>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Department (optional)</label>
                        <select
                            className="form-input"
                            value={departmentId}
                            onChange={(e) => setDepartmentId(e.target.value)}
                        >
                            <option value="">All Departments</option>
                            {departments.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-2 gap-4">
                        <div className="form-group">
                            <label className="form-label">Class *</label>
                            <select
                                className="form-input"
                                value={classId}
                                onChange={(e) => setClassId(e.target.value)}
                                required
                                disabled={loadingLists}
                            >
                                <option value="">Select Class</option>
                                {classes.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Subject *</label>
                            <select
                                className="form-input"
                                value={subjectId}
                                onChange={(e) => setSubjectId(e.target.value)}
                                required
                                disabled={loadingLists}
                            >
                                <option value="">Select Subject</option>
                                {subjects.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Academic Year (optional)</label>
                        <input
                            type="text"
                            className="form-input"
                            value={academicYear}
                            onChange={(e) => setAcademicYear(e.target.value)}
                            placeholder="e.g. 2025-2026"
                        />
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting || loadingLists}>
                            {submitting ? 'Assigning...' : 'Assign'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const TeacherAssignmentsModal = ({ teacher, initialAssignments, classNameById, subjectNameById, fetchAssignmentsFn, onClose, onCountUpdate, onCacheUpdate }) => {
    const teacherUid = teacher?.uid || teacher?.id;
    const toast = useToast();
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [removingId, setRemovingId] = useState(null);

    const fetchAssignments = async () => {
        if (!teacherUid) return;
        setLoading(true);
        try {
            const normalized = await (fetchAssignmentsFn
                ? fetchAssignmentsFn(teacherUid)
                : adminAPI.getTeacherAssignments(teacherUid).then((r) => (Array.isArray(r?.data?.data) ? r.data.data : [])));
            setAssignments(normalized);
            onCountUpdate?.(teacherUid, normalized.length);
            onCacheUpdate?.(teacherUid, normalized);
        } catch (e) {
            setAssignments([]);
            onCountUpdate?.(teacherUid, 0);
            onCacheUpdate?.(teacherUid, []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (Array.isArray(initialAssignments)) {
            setAssignments(initialAssignments);
            setLoading(false);
            onCountUpdate?.(teacherUid, initialAssignments.length);
        } else {
            fetchAssignments();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teacherUid]);

    const getClassLabel = (a) => {
        const id = a?.classId || a?.class_id;
        if (!id) return '-';
        return classNameById?.[id] || id;
    };

    const getSubjectLabel = (a) => {
        const id = a?.subjectId || a?.subject_id;
        if (!id) return '-';
        return subjectNameById?.[id] || id;
    };

    const handleRemove = async (assignmentId) => {
        if (!assignmentId) return;
        setRemovingId(assignmentId);
        try {
            await adminAPI.removeAssignment(assignmentId);
            toast.success('Assignment removed');
            await fetchAssignments();
        } catch (e) {
            toast.error(e?.response?.data?.message || e?.message || 'Failed to remove assignment');
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 720 }}>
                <div className="modal-header">
                    <h3 className="modal-title">Teacher Assignments</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="mb-4">
                    <div className="text-gray" style={{ fontSize: '0.875rem' }}>
                        Teacher: <strong>{getDisplayName(teacher) || teacherUid}</strong>
                    </div>
                </div>

                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Class</th>
                                <th>Subject</th>
                                <th>Academic Year</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="4" className="text-center">Loading...</td>
                                </tr>
                            ) : assignments.length > 0 ? (
                                assignments.map((a) => (
                                    <tr key={a.id || a.assignmentId || a.assignment_id}>
                                        <td>{getClassLabel(a)}</td>
                                        <td>{getSubjectLabel(a)}</td>
                                        <td>{a.academicYear || a.academic_year || '-'}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline"
                                                disabled={removingId === (a.id || a.assignmentId || a.assignment_id)}
                                                onClick={() => handleRemove(a.id || a.assignmentId || a.assignment_id)}
                                            >
                                                {removingId === (a.id || a.assignmentId || a.assignment_id) ? 'Removing...' : 'Remove'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="4" className="text-center">No assignments found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UserManagement;
