import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { teacherAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { subscribeSse } from '../../services/sse';

const formatDateTime = (value) => {
    if (!value) return 'NA';
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return 'NA';
    return new Date(ms).toLocaleString();
};

const getStatusBadgeClass = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'present') return 'badge-success';
    if (s === 'absent') return 'badge-danger';
    if (s === 'late') return 'badge-warning';
    if (s === 'excused') return 'badge-info';
    return 'badge-secondary';
};

const getVerificationStyle = (verificationStatus) => {
    const v = String(verificationStatus || '').toLowerCase();

    // Backend uses verified / unverified / flagged / manual.
    // For UX, treat manual as verified.
    if (v === 'verified' || v === 'manual') return { label: v === 'manual' ? 'verified' : 'verified', className: 'text-success' };
    if (v === 'unverified') return { label: 'unverified', className: 'text-warning' };
    if (v === 'flagged') return { label: 'flagged', className: 'text-orange' };
    return { label: v || 'NA', className: 'text-gray' };
};

const normalizeFlagCodesToLabels = (codes) => {
    const list = (codes || []).map((c) => String(c || '').trim()).filter(Boolean);
    if (list.length === 0) return 'NA';

    const mapOne = (code) => {
        const raw = String(code || '').trim();
        const lower = raw.toLowerCase();

        // Spec examples
        if (lower === 'outside_geofence') return 'Outside Geofence';
        if (lower === 'wrong_wifi') return 'Wrong WiFi';
        if (lower === 'late') return 'Late';
        if (lower === 'offline_pending') return 'Offline Pending';

        // Backend release reasons
        if (raw === 'OUTSIDE_GEOFENCE') return 'Outside Geofence';
        if (raw === 'WIFI_NOT_ALLOWED') return 'Wrong WiFi';

        return raw;
    };

    return Array.from(new Set(list.map(mapOne))).join(', ');
};

const formatFlag = (flag) => {
    if (flag === null || flag === undefined) return 'NA';
    if (typeof flag === 'string') return normalizeFlagCodesToLabels([flag]);

    if (typeof flag === 'object') {
        if (Array.isArray(flag.reasons)) return normalizeFlagCodesToLabels(flag.reasons);
        if (flag.reason) return normalizeFlagCodesToLabels([flag.reason]);
        if (flag.type) return normalizeFlagCodesToLabels([flag.type]);
    }

    return 'NA';
};

const SessionDetailPage = () => {
    const toast = useToast();
    const toastRef = useRef(toast);
    const { sessionId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [detail, setDetail] = useState(null);

    const [overrideOpen, setOverrideOpen] = useState(false);
    const [overrideSubmitting, setOverrideSubmitting] = useState(false);
    const [overrideTarget, setOverrideTarget] = useState(null);
    const [overrideForm, setOverrideForm] = useState({ status: 'present', reason: '' });

    useEffect(() => {
        toastRef.current = toast;
    }, [toast]);

    const fetchDetail = useCallback(async () => {
        if (!sessionId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await teacherAPI.getSession(sessionId, { includeAttendance: true, limit: 200 });
            setDetail(res.data.data);
        } catch (e) {
            const msg = e?.response?.data?.message || 'Failed to load session details';
            setError(msg);
            toastRef.current?.error?.(msg);
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    useEffect(() => {
        fetchDetail();
    }, [fetchDetail]);

    // Realtime stats via SSE (per-session only)
    useEffect(() => {
        if (!sessionId) return undefined;

        const abort = new AbortController();
        let closed = false;

        const url = `/api/teacher/sessions/${encodeURIComponent(String(sessionId))}/stream`;
        (async () => {
            await subscribeSse({
                url,
                signal: abort.signal,
                onEvent: ({ event, data }) => {
                    if (closed) return;
                    if (event !== 'init' && event !== 'delta') return;
                    if (!data || typeof data !== 'object') return;

                    setDetail((prev) => {
                        if (!prev) return prev;
                        const prevStats = prev.stats || {};
                        const nextStats = {
                            ...prevStats,
                            ...(data.presentCount !== undefined ? { presentCount: data.presentCount } : null),
                            ...(data.lateCount !== undefined ? { lateCount: data.lateCount } : null),
                            ...(data.flaggedCount !== undefined ? { flaggedCount: data.flaggedCount } : null),
                            ...(data.suspiciousCount !== undefined ? { suspiciousCount: data.suspiciousCount } : null)
                        };

                        const total = nextStats.totalStudents ?? prevStats.totalStudents ?? prev.session?.total_students ?? prev.summary?.total ?? null;
                        const present = Number(nextStats.presentCount) || 0;
                        const late = Number(nextStats.lateCount) || 0;
                        const flagged = Number(nextStats.flaggedCount) || 0;
                        const suspicious = Number(nextStats.suspiciousCount) || 0;
                        const absent = Number.isFinite(Number(total)) ? Math.max(0, Number(total) - (present + late)) : null;

                        return {
                            ...prev,
                            stats: nextStats,
                            summary: {
                                total,
                                present,
                                late,
                                absent,
                                flagged,
                                suspicious
                            }
                        };
                    });
                },
                onError: () => {
                    // Best-effort realtime only; UI still works via manual refresh.
                }
            });
        })();

        return () => {
            closed = true;
            abort.abort();
        };
    }, [sessionId]);

    const session = detail?.session || null;
    const attendance = useMemo(() => (Array.isArray(detail?.attendance) ? detail.attendance : []), [detail?.attendance]);

    const summary = useMemo(() => {
        if (detail?.summary) return detail.summary;
        const total = detail?.stats?.totalStudents ?? attendance.length;
        const present = Number(detail?.stats?.presentCount) || 0;
        const late = Number(detail?.stats?.lateCount) || 0;
        const flagged = Number(detail?.stats?.flaggedCount) || 0;
        const absent = Number.isFinite(Number(total)) ? Math.max(0, Number(total) - (present + late)) : null;
        return { total, present, late, absent, flagged };
    }, [attendance.length, detail?.stats, detail?.summary]);

    const loadMore = useCallback(async () => {
        const nextCursor = detail?.page?.nextCursor;
        if (!sessionId || !nextCursor) return;

        try {
            const res = await teacherAPI.getSession(sessionId, { includeAttendance: true, limit: 200, cursor: nextCursor });
            const next = res?.data?.data;
            const nextAttendance = Array.isArray(next?.attendance) ? next.attendance : [];

            setDetail((prev) => {
                if (!prev) return next;
                const prevAttendance = Array.isArray(prev.attendance) ? prev.attendance : [];
                const merged = [...prevAttendance, ...nextAttendance];
                return {
                    ...prev,
                    session: next?.session || prev.session,
                    stats: next?.stats || prev.stats,
                    summary: next?.summary || prev.summary,
                    attendance: merged,
                    page: next?.page || prev.page
                };
            });
        } catch (e) {
            toastRef.current?.error?.(e?.response?.data?.message || 'Failed to load more records');
        }
    }, [detail?.page?.nextCursor, sessionId]);

    const openOverride = (record) => {
        setOverrideTarget(record);
        setOverrideForm({ status: 'present', reason: '' });
        setOverrideOpen(true);
    };

    const closeOverride = () => {
        setOverrideOpen(false);
        setOverrideSubmitting(false);
        setOverrideTarget(null);
        setOverrideForm({ status: 'present', reason: '' });
    };

    const applyOverride = async () => {
        if (!session?.id || !overrideTarget?.student_id) return;
        if (!overrideForm.reason || !String(overrideForm.reason).trim()) {
            toast.error('Please provide a reason');
            return;
        }

        setOverrideSubmitting(true);
        try {
            await teacherAPI.overrideAttendance(session.id, {
                studentId: overrideTarget.student_id,
                status: overrideForm.status,
                reason: overrideForm.reason
            });

            // Row-only state update (no full reload)
            setDetail((prev) => {
                if (!prev || !Array.isArray(prev.attendance)) return prev;
                const nowIso = new Date().toISOString();
                const updatedAttendance = prev.attendance.map((r) => {
                    if (!r || r.student_id !== overrideTarget.student_id) return r;
                    return {
                        ...r,
                        status: overrideForm.status,
                        // Backend stores manual, but UI treats it as verified.
                        verification_status: 'manual',
                        manual_override: true,
                        override_reason: overrideForm.reason,
                        marked_at: nowIso,
                        marked_at_ms: Date.now(),
                        flag: null
                    };
                });
                return { ...prev, attendance: updatedAttendance };
            });

            toast.success('Attendance override successful');
            closeOverride();

            // Refresh stats (best-effort) without reloading the full attendance list.
            try {
                const statsRes = await teacherAPI.getSession(session.id, { includeAttendance: false });
                setDetail((prev) => (prev ? { ...prev, stats: statsRes?.data?.data?.stats || prev.stats, summary: statsRes?.data?.data?.summary || prev.summary } : prev));
            } catch (_) {
                // ignore
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to override attendance');
            setOverrideSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="loading">
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <div className="page-header">
                    <h1 className="page-title">Session Details</h1>
                    <button className="btn btn-outline" onClick={() => navigate('/teacher/sessions')}>Back to Sessions</button>
                </div>
                <div className="card">
                    <div className="text-center">{error}</div>
                </div>
            </div>
        );
    }

    if (!session) {
        return (
            <div>
                <div className="page-header">
                    <h1 className="page-title">Session Details</h1>
                    <button className="btn btn-outline" onClick={() => navigate('/teacher/sessions')}>Back to Sessions</button>
                </div>
                <div className="card">
                    <div className="text-center">Session not found</div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Session Details</h1>
                <div className="flex-center gap-2">
                    <button className="btn btn-outline" onClick={fetchDetail} title="Refresh">
                        <RefreshCw size={16} /> Refresh
                    </button>
                    <button className="btn btn-outline" onClick={() => navigate('/teacher/sessions')}>Back</button>
                </div>
            </div>

            {/* Header card */}
            <div className="card mb-4">
                <div className="grid grid-3 gap-4">
                    <div>
                        <div className="stat-label">Class</div>
                        <div className="stat-value" style={{ fontSize: '1.25rem' }}>{session.class_name || 'NA'}</div>
                    </div>
                    <div>
                        <div className="stat-label">Subject</div>
                        <div className="stat-value" style={{ fontSize: '1.25rem' }}>{session.subject_name || 'NA'}</div>
                    </div>
                    <div>
                        <div className="stat-label">Session Code</div>
                        <div style={{ marginTop: '0.25rem' }}>
                            <code className="session-code">{session.session_code || 'NA'}</code>
                        </div>
                    </div>
                </div>

                <div className="grid grid-3 gap-4" style={{ marginTop: '1rem' }}>
                    <div>
                        <div className="stat-label">Started At</div>
                        <div>{formatDateTime(session.started_at)}</div>
                    </div>
                    <div>
                        <div className="stat-label">Ended At</div>
                        <div>{formatDateTime(session.ended_at)}</div>
                    </div>
                    <div>
                        <div className="stat-label">Status</div>
                        <span className={`badge ${session.status === 'active' ? 'badge-success' : session.status === 'completed' ? 'badge-primary' : 'badge-secondary'}`}>
                            {session.status || 'NA'}
                        </span>
                    </div>
                </div>

                <div className="grid grid-4 gap-4" style={{ marginTop: '1rem' }}>
                    <div className="stat-card" style={{ boxShadow: 'none', padding: 0 }}>
                        <div className="stat-label">Total Students</div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summary.total}</div>
                    </div>
                    <div className="stat-card" style={{ boxShadow: 'none', padding: 0 }}>
                        <div className="stat-label">Present</div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summary.present}</div>
                    </div>
                    <div className="stat-card" style={{ boxShadow: 'none', padding: 0 }}>
                        <div className="stat-label">Absent</div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summary.absent}</div>
                    </div>
                    <div className="stat-card" style={{ boxShadow: 'none', padding: 0 }}>
                        <div className="stat-label">Flagged</div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summary.flagged}</div>
                    </div>
                </div>
            </div>

            {/* Attendance table */}
            <div className="card">
                <div className="table-container">
                    <table className="table table-sticky">
                        <thead>
                            <tr>
                                <th>Student ID</th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Verification</th>
                                <th>Flag</th>
                                <th>Marked Time</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attendance.length > 0 ? (
                                attendance.map((record) => {
                                    const verification = getVerificationStyle(record?.verification_status);
                                    const email = record?.email || record?.student_email || record?.studentEmail || null;
                                    const flagged = String(record?.verification_status || '').toLowerCase() === 'flagged';

                                    const status = String(record?.status || '').toLowerCase();
                                    const v = String(record?.verification_status || '').toLowerCase();
                                    const isManual = v === 'manual' || Boolean(record?.manual_override);
                                    const isVerified = v === 'verified';
                                    const disableOverride = isManual || (status === 'present' && (isVerified || isManual));
                                    const overrideTitle = disableOverride
                                        ? (isManual ? 'Already manually overridden' : 'Already present & verified')
                                        : 'Manual override';

                                    return (
                                        <tr key={record?.student_id || Math.random()}>
                                            <td>{record?.student_id || 'NA'}</td>
                                            <td>{record?.student_name || 'NA'}</td>
                                            <td>{email || 'NA'}</td>
                                            <td>
                                                <span className={`badge ${getStatusBadgeClass(record?.status)}`}>
                                                    {record?.status || 'NA'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={verification.className}>{verification.label}</span>
                                                {flagged && (
                                                    <button
                                                        className="btn btn-sm btn-outline"
                                                        style={{ marginLeft: '0.5rem' }}
                                                        onClick={() => navigate(`/admin/monitoring?filter=sessionId&sessionId=${encodeURIComponent(String(session.id || sessionId))}`)}
                                                        title="View suspicious activities"
                                                    >
                                                        <AlertTriangle size={14} /> View Suspicious
                                                    </button>
                                                )}
                                            </td>
                                            <td>{formatFlag(record?.flag)}</td>
                                            <td>{record?.marked_at ? new Date(record.marked_at).toLocaleString() : 'NA'}</td>
                                            <td>
                                                <button
                                                    className="btn btn-sm btn-outline"
                                                    disabled={disableOverride}
                                                    onClick={() => openOverride(record)}
                                                    title={overrideTitle}
                                                >
                                                    Manual Override
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="8" className="text-center">No attendance records found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {detail?.page?.nextCursor && (
                    <div className="flex-center" style={{ padding: '1rem' }}>
                        <button className="btn btn-outline" onClick={loadMore}>
                            Load More
                        </button>
                    </div>
                )}
            </div>

            {/* Override confirm modal */}
            {overrideOpen && overrideTarget && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '560px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Confirm Manual Override</h3>
                            <button className="modal-close" onClick={closeOverride}>&times;</button>
                        </div>

                        <div className="card" style={{ background: 'var(--gray-50)', boxShadow: 'none' }}>
                            <div><strong>Student:</strong> {overrideTarget.student_name || overrideTarget.student_id}</div>
                            <div><strong>Student ID:</strong> {overrideTarget.student_id}</div>
                        </div>

                        <div style={{ marginTop: '1rem' }}>
                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select
                                    className="form-input"
                                    value={overrideForm.status}
                                    onChange={(e) => setOverrideForm((p) => ({ ...p, status: e.target.value }))}
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
                                    value={overrideForm.reason}
                                    onChange={(e) => setOverrideForm((p) => ({ ...p, reason: e.target.value }))}
                                    placeholder="Reason for override"
                                />
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={closeOverride} disabled={overrideSubmitting}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={applyOverride} disabled={overrideSubmitting}>
                                {overrideSubmitting ? 'Applying...' : 'Confirm Override'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SessionDetailPage;
