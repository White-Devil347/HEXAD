import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { teacherAPI } from '../../services/api';
import { Plus, RefreshCw, Play, Square, Eye, Users } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const Sessions = () => {
    const toast = useToast();
    const location = useLocation();
    const navigate = useNavigate();
    const [sessions, setSessions] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createInitialAssignmentId, setCreateInitialAssignmentId] = useState('');
    const [selectedSession, setSelectedSession] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [filter, setFilter] = useState('all');

    const hasAutoOpenedCreateRef = useRef(false);
    const toastRef = useRef(toast);

    useEffect(() => {
        toastRef.current = toast;
    }, [toast]);

    const query = useMemo(() => new URLSearchParams(location.search || ''), [location.search]);
    const createFromUrl = query.get('create') === '1' || query.get('create') === 'true';
    const assignmentIdFromUrl = query.get('assignmentId') || query.get('assignment_id') || '';
    const classIdFromUrl = query.get('classId') || query.get('class_id') || '';
    const subjectIdFromUrl = query.get('subjectId') || query.get('subject_id') || '';

    const fetchData = useCallback(async () => {
        setLoading(true);
        const [sessionsRes, assignmentsRes] = await Promise.allSettled([
            teacherAPI.getSessions({
                ...(classIdFromUrl ? { classId: classIdFromUrl } : {}),
                ...(subjectIdFromUrl ? { subjectId: subjectIdFromUrl } : {})
            }),
            teacherAPI.getAssignments()
        ]);

        if (sessionsRes.status === 'fulfilled') {
            setSessions(sessionsRes.value.data.data || []);
        } else {
            console.error('Failed to fetch sessions:', sessionsRes.reason);
            toastRef.current?.error?.(sessionsRes.reason?.response?.data?.message || 'Failed to fetch sessions');
        }

        if (assignmentsRes.status === 'fulfilled') {
            setAssignments(assignmentsRes.value.data.data || []);
        } else {
            console.error('Failed to fetch assignments:', assignmentsRes.reason);
            toastRef.current?.error?.(assignmentsRes.reason?.response?.data?.message || 'Failed to fetch assignments');
        }

        setLoading(false);
    }, [classIdFromUrl, subjectIdFromUrl]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (!createFromUrl) return;
        if (hasAutoOpenedCreateRef.current) return;

        // Open once per mount; if an assignmentId is provided, preselect it.
        setCreateInitialAssignmentId(String(assignmentIdFromUrl || ''));
        setShowCreateModal(true);
        hasAutoOpenedCreateRef.current = true;
    }, [createFromUrl, assignmentIdFromUrl]);

    const handleStartSession = async (sessionId) => {
        try {
            await teacherAPI.startSession(sessionId);
            setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status: 'active', started_at: new Date().toISOString() } : s)));
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to start session');
        }
    };

    const handleEndSession = async (sessionId) => {
        try {
            await teacherAPI.endSession(sessionId);
            setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status: 'completed', ended_at: new Date().toISOString() } : s)));
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to end session');
        }
    };

    const handleRegenerateCode = async (sessionId) => {
        try {
            const response = await teacherAPI.regenerateCode(sessionId);
            const newCode = response.data.data.sessionCode ?? response.data.data.session_code;
            if (newCode) {
                toast.info(String(newCode), { title: 'New session code', durationMs: 8000 });
            } else {
                toast.error('Failed to regenerate code');
            }
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to regenerate code');
        }
    };

    const viewSessionDetail = (id) => {
        navigate(`/teacher/sessions/${encodeURIComponent(String(id))}/details`);
    };

    const filteredSessions = sessions.filter(session => {
        if (filter === 'all') return true;
        return session.status === filter;
    });

    const getStatusBadge = (status) => {
        const badges = {
            scheduled: 'badge-warning',
            active: 'badge-success',
            completed: 'badge-primary',
            cancelled: 'badge-danger'
        };
        return badges[status] || 'badge-secondary';
    };

    if (loading) {
        return (
            <div className="loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Attendance Sessions</h1>
                <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                    <Plus size={16} /> Create Session
                </button>
            </div>

            {/* Filters */}
            <div className="card mb-4">
                <div className="flex-center gap-2">
                    <span>Filter:</span>
                    {['all', 'scheduled', 'active', 'completed', 'cancelled'].map(status => (
                        <button
                            key={status}
                            className={`btn btn-sm ${filter === status ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setFilter(status)}
                        >
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Sessions List */}
            <div className="card">
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Session Code</th>
                                <th>Class / Subject</th>
                                <th>Date & Time</th>
                                <th>Duration</th>
                                <th>Attendance</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSessions.length > 0 ? (
                                filteredSessions.map((session) => (
                                    <tr
                                        key={session.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => viewSessionDetail(session.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') viewSessionDetail(session.id);
                                        }}
                                        style={{ cursor: 'pointer' }}
                                        title="Open session details"
                                    >
                                        <td>
                                            <code className="session-code">{session.session_code}</code>
                                        </td>
                                        <td>
                                            <div>{session.class_name}</div>
                                            <small className="text-gray">{session.subject_name}</small>
                                        </td>
                                        <td>
                                            {new Date(session.session_date).toLocaleDateString()}
                                            <br />
                                            <small className="text-gray">
                                                {session.start_time?.slice(0, 5)} - {session.end_time?.slice(0, 5)}
                                            </small>
                                        </td>
                                        <td>{session.duration_minutes} min</td>
                                        <td>
                                            <div className="flex-center gap-1">
                                                <Users size={14} />
                                                {session.attendance_count ?? session.present_count ?? 0} / {session.total_students || 0}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${getStatusBadge(session.status)}`}>
                                                {session.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex-center gap-1">
                                                <button
                                                    className="btn btn-sm btn-outline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        viewSessionDetail(session.id);
                                                    }}
                                                    title="View Details"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                                {session.status === 'scheduled' && (
                                                    <button
                                                        className="btn btn-sm btn-success"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleStartSession(session.id);
                                                        }}
                                                        title="Start Session"
                                                    >
                                                        <Play size={14} />
                                                    </button>
                                                )}
                                                {session.status === 'active' && (
                                                    <>
                                                        <button
                                                            className="btn btn-sm btn-warning"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRegenerateCode(session.id);
                                                            }}
                                                            title="Regenerate Code"
                                                        >
                                                            <RefreshCw size={14} />
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-danger"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEndSession(session.id);
                                                            }}
                                                            title="End Session"
                                                        >
                                                            <Square size={14} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="7" className="text-center">
                                        No sessions found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Session Modal */}
            {showCreateModal && (
                <CreateSessionModal
                    assignments={assignments}
                    initialAssignmentId={createInitialAssignmentId}
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => {
                        setShowCreateModal(false);
                        fetchData();
                    }}
                />
            )}

            {/* Session Detail Modal */}
            {showDetailModal && selectedSession && (
                <SessionDetailModal
                    session={selectedSession}
                    onClose={() => {
                        setShowDetailModal(false);
                        setSelectedSession(null);
                    }}
                    onRefresh={fetchData}
                />
            )}
        </div>
    );
};

// Create Session Modal Component
const CreateSessionModal = ({ assignments, initialAssignmentId, onClose, onSuccess }) => {
    const toast = useToast();
    const DEFAULT_DURATION_MINUTES = 60;

    const parseTimeToMinutes = (timeValue) => {
        const match = String(timeValue || '').match(/^(\d{2}):(\d{2})$/);
        if (!match) return null;
        const hh = Number(match[1]);
        const mm = Number(match[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return hh * 60 + mm;
    };

    const minutesToTime = (minutes) => {
        const minsInDay = 24 * 60;
        const safe = ((Number(minutes) || 0) % minsInDay + minsInDay) % minsInDay;
        const hh = String(Math.floor(safe / 60)).padStart(2, '0');
        const mm = String(safe % 60).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    const computeDurationMinutes = (startTime, endTime) => {
        const start = parseTimeToMinutes(startTime);
        const end = parseTimeToMinutes(endTime);
        if (start === null || end === null) return DEFAULT_DURATION_MINUTES;
        let diff = end - start;
        if (diff < 0) diff += 24 * 60;
        return diff;
    };

    const openTimePicker = (event) => {
        if (typeof event?.target?.showPicker === 'function') {
            event.target.showPicker();
        }
    };

    const preventManualTimeTyping = (event) => {
        const blocked = ['Backspace', 'Delete'];
        if (event.key.length === 1 || blocked.includes(event.key)) {
            event.preventDefault();
        }
    };

    const displayAssignments = useMemo(() => {
        const byClassSubject = new Map();
        for (const a of assignments || []) {
            const key = `${String(a?.class_id || '')}|${String(a?.subject_id || '')}`;
            if (!byClassSubject.has(key)) byClassSubject.set(key, a);
        }
        return Array.from(byClassSubject.values());
    }, [assignments]);

    const [formData, setFormData] = useState({
        assignment_id: initialAssignmentId ? String(initialAssignmentId) : '',
        session_date: new Date().toISOString().split('T')[0],
        start_time: '09:00',
        end_time: '10:00',
        duration_minutes: DEFAULT_DURATION_MINUTES,
        late_threshold_minutes: 15,
        geofence_radius_meters: 100,
        require_photo: true,
        require_location: true,
        require_wifi: false
    });
    const [submitting, setSubmitting] = useState(false);

    const handleStartTimeChange = (value) => {
        const startMins = parseTimeToMinutes(value);
        if (startMins === null) {
            setFormData((prev) => ({ ...prev, start_time: value }));
            return;
        }

        const mappedEndTime = minutesToTime(startMins + DEFAULT_DURATION_MINUTES);
        setFormData((prev) => ({
            ...prev,
            start_time: value,
            end_time: mappedEndTime,
            duration_minutes: DEFAULT_DURATION_MINUTES
        }));
    };

    const handleEndTimeChange = (value) => {
        setFormData((prev) => ({
            ...prev,
            end_time: value,
            duration_minutes: computeDurationMinutes(prev.start_time, value)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const selectedId = String(formData.assignment_id || '');
            const assignment = assignments.find((a) => String(a.id) === selectedId);
            if (!assignment) {
                toast.error('Please select a valid assignment');
                setSubmitting(false);
                return;
            }

            const payload = {
                assignmentId: assignment.id,
                classId: assignment.class_id,
                subjectId: assignment.subject_id,
                sessionDate: formData.session_date,
                startTime: formData.start_time,
                endTime: formData.end_time,
                geoRadius: formData.geofence_radius_meters
            };

            await teacherAPI.createSession(payload);
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create session');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h3 className="modal-title">Create Attendance Session</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Assignment (Class - Subject)</label>
                        <select
                            className="form-input"
                            value={formData.assignment_id}
                            onChange={(e) => setFormData({ ...formData, assignment_id: e.target.value })}
                            required
                        >
                            <option value="">Select assignment...</option>
                            {displayAssignments.map((a) => {
                                const dept = a.department_name ? String(a.department_name) : null;
                                const classLabel = a.class_name || a.class_code || 'Class';
                                const subjectLabel = a.subject_name || a.subject_code || 'Subject';
                                const year = a.academic_year || a.academicYear ? (a.academic_year || a.academicYear) : null;
                                const suffix = year ? ` (${year})` : '';
                                const label = dept
                                    ? `${dept} • ${classLabel} - ${subjectLabel}${suffix}`
                                    : `${classLabel} - ${subjectLabel}${suffix}`;
                                return (
                                    <option key={a.id} value={a.id}>
                                        {label}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    <div className="grid grid-2">
                        <div className="form-group">
                            <label className="form-label">Date</label>
                            <input
                                type="date"
                                className="form-input"
                                value={formData.session_date}
                                onChange={(e) => setFormData({ ...formData, session_date: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Duration (minutes)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={formData.duration_minutes}
                                readOnly
                                min="15"
                                max="180"
                            />
                        </div>
                    </div>

                    <div className="grid grid-2">
                        <div className="form-group">
                            <label className="form-label">Start Time</label>
                            <input
                                type="time"
                                className="form-input"
                                value={formData.start_time}
                                onChange={(e) => handleStartTimeChange(e.target.value)}
                                onFocus={openTimePicker}
                                onClick={openTimePicker}
                                onKeyDown={preventManualTimeTyping}
                                step="60"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">End Time</label>
                            <input
                                type="time"
                                className="form-input"
                                value={formData.end_time}
                                onChange={(e) => handleEndTimeChange(e.target.value)}
                                onFocus={openTimePicker}
                                onClick={openTimePicker}
                                onKeyDown={preventManualTimeTyping}
                                step="60"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-2">
                        <div className="form-group">
                            <label className="form-label">Late Threshold (minutes)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={formData.late_threshold_minutes}
                                onChange={(e) => setFormData({ ...formData, late_threshold_minutes: parseInt(e.target.value) })}
                                min="5"
                                max="60"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Geofence Radius (meters)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={formData.geofence_radius_meters}
                                onChange={(e) => setFormData({ ...formData, geofence_radius_meters: parseInt(e.target.value) })}
                                min="50"
                                max="500"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Requirements</label>
                        <div className="flex-center gap-4">
                            <label className="flex-center gap-1">
                                <input
                                    type="checkbox"
                                    checked={formData.require_photo}
                                    onChange={(e) => setFormData({ ...formData, require_photo: e.target.checked })}
                                />
                                Photo
                            </label>
                            <label className="flex-center gap-1">
                                <input
                                    type="checkbox"
                                    checked={formData.require_location}
                                    onChange={(e) => setFormData({ ...formData, require_location: e.target.checked })}
                                />
                                Location
                            </label>
                            <label className="flex-center gap-1">
                                <input
                                    type="checkbox"
                                    checked={formData.require_wifi}
                                    onChange={(e) => setFormData({ ...formData, require_wifi: e.target.checked })}
                                />
                                WiFi
                            </label>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Creating...' : 'Create Session'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Session Detail Modal Component
const SessionDetailModal = ({ session, onClose, onRefresh }) => {
    const toast = useToast();
    const [overrideData, setOverrideData] = useState({
        studentId: '',
        status: 'present',
        reason: ''
    });
    const [showOverride, setShowOverride] = useState(false);

    const handleOverride = async (e) => {
        e.preventDefault();
        try {
            await teacherAPI.overrideAttendance(session.session.id, overrideData);
            setShowOverride(false);
            setOverrideData({ studentId: '', status: 'present', reason: '' });
            onRefresh();
            toast.success('Attendance override successful');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to override attendance');
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            present: 'badge-success',
            late: 'badge-warning',
            absent: 'badge-danger',
            excused: 'badge-info'
        };
        return badges[status] || 'badge-secondary';
    };

    return (
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '800px' }}>
                <div className="modal-header">
                    <h3 className="modal-title">
                        Session Details - {session.session.session_code}
                    </h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                {/* Session Info */}
                <div className="grid grid-4 mb-4">
                    <div className="stat-card">
                        <div className="stat-label">Status</div>
                        <span className={`badge badge-${session.session.status === 'active' ? 'success' : session.session.status === 'completed' ? 'primary' : 'warning'}`}>
                            {session.session.status}
                        </span>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Date</div>
                        <div>{new Date(session.session.session_date).toLocaleDateString()}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Time</div>
                        <div>{session.session.start_time?.slice(0, 5)} - {session.session.end_time?.slice(0, 5)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Present</div>
                        <div>
                            {session.attendance?.filter((a) => {
                                const status = String(a?.status || '').toLowerCase();
                                const v = String(a?.verification_status || '').toLowerCase();
                                // Release rule: flagged counts as absent.
                                if (v === 'flagged') return false;
                                return status === 'present' || status === 'late';
                            }).length || 0} / {session.attendance?.length || 0}
                        </div>
                    </div>
                </div>

                {/* Override Button */}
                {session.session.status !== 'cancelled' && (
                    <div className="mb-4">
                        <button
                            className="btn btn-outline"
                            onClick={() => setShowOverride(!showOverride)}
                        >
                            {showOverride ? 'Cancel Override' : 'Manual Override'}
                        </button>
                    </div>
                )}

                {/* Override Form */}
                {showOverride && (
                    <form onSubmit={handleOverride} className="card mb-4" style={{ background: '#f8fafc' }}>
                        <div className="grid grid-3 gap-2">
                            <div className="form-group">
                                <label className="form-label">Student</label>
                                <select
                                    className="form-input"
                                    value={overrideData.studentId}
                                    onChange={(e) => setOverrideData({ ...overrideData, studentId: e.target.value })}
                                    required
                                >
                                    <option value="">Select student...</option>
                                    {session.attendance?.map((a) => (
                                        <option key={a.student_id} value={a.student_id}>
                                            {`${a.first_name || ''} ${a.last_name || ''}`.trim()} ({a.roll_number})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select
                                    className="form-input"
                                    value={overrideData.status}
                                    onChange={(e) => setOverrideData({ ...overrideData, status: e.target.value })}
                                >
                                    <option value="present">Present</option>
                                    <option value="late">Late</option>
                                    <option value="absent">Absent</option>
                                    <option value="excused">Excused</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Reason</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={overrideData.reason}
                                    onChange={(e) => setOverrideData({ ...overrideData, reason: e.target.value })}
                                    placeholder="Reason for override"
                                    required
                                />
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary btn-sm">
                            Apply Override
                        </button>
                    </form>
                )}

                {/* Attendance Table */}
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Roll No</th>
                                <th>Student Name</th>
                                <th>Status</th>
                                <th>Marked At</th>
                                <th>Verification</th>
                                <th>Location</th>
                            </tr>
                        </thead>
                        <tbody>
                            {session.attendance?.length > 0 ? (
                                session.attendance.map((record) => (
                                    <tr key={record.student_id}>
                                        <td>{record.roll_number}</td>
                                        <td>{record.student_name}</td>
                                        <td>
                                            <span className={`badge ${getStatusBadge(record.status)}`}>
                                                {record.status}
                                            </span>
                                        </td>
                                        <td>
                                            {record.marked_at ? new Date(record.marked_at).toLocaleTimeString() : '-'}
                                        </td>
                                        <td>
                                            <span
                                                className={`badge ${
                                                    record.verification_status === 'verified' || record.verification_status === 'manual'
                                                        ? 'badge-success'
                                                        : record.verification_status === 'unverified'
                                                            ? 'badge-warning'
                                                            : record.verification_status === 'flagged'
                                                                ? 'badge-warning'
                                                                : 'badge-secondary'
                                                }`}
                                            >
                                                {record.verification_status || 'N/A'}
                                            </span>
                                        </td>
                                        <td>
                                            {record.is_within_geofence !== null ? (
                                                <span className={`badge ${record.is_within_geofence ? 'badge-success' : 'badge-danger'}`}>
                                                    {record.is_within_geofence ? 'Within' : 'Outside'}
                                                </span>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="text-center">No attendance records</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-outline" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default Sessions;
