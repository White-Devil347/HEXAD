import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { Activity, AlertTriangle, RefreshCw, Search, Eye, CheckCircle, Filter } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const Monitoring = () => {
    const toast = useToast();
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('audit');
    const [auditLogs, setAuditLogs] = useState([]);
    const [syncLogs, setSyncLogs] = useState([]);
    const [suspiciousActivities, setSuspiciousActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        search: '',
        action: '',
        resolved: '',
        sessionId: ''
    });
    const [pagination, setPagination] = useState({ page: 1, limit: 20 });
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [userCache, setUserCache] = useState({});

    // Support deep links like: /admin/monitoring?filter=sessionId&sessionId=...
    useEffect(() => {
        const params = new URLSearchParams(location.search || '');
        const filter = params.get('filter');
        const sessionId = params.get('sessionId');

        if (filter === 'sessionId' && sessionId) {
            setActiveTab('suspicious');
            setFilters((prev) => ({ ...prev, sessionId: String(sessionId) }));
            setPagination((prev) => ({ ...prev, page: 1, limit: Math.max(prev.limit || 20, 200) }));
        } else {
            // If the URL no longer has the filter, clear it.
            setFilters((prev) => (prev.sessionId ? { ...prev, sessionId: '' } : prev));
            setPagination((prev) => ({ ...prev, limit: prev.limit > 20 ? 20 : prev.limit }));
        }
    }, [location.search]);

    const getActivitySessionId = (activity) => {
        return activity?.session_id || activity?.sessionId || activity?.session || null;
    };

    const getActivityStudentUid = (activity) => {
        return activity?.student_uid || activity?.studentUid || activity?.student_id || activity?.studentId || null;
    };

    const formatUserName = (user) => {
        const first = String(user?.firstName || '').trim();
        const last = String(user?.lastName || '').trim();
        const full = `${first} ${last}`.trim();
        return full || user?.email || user?.studentId || user?.teacherId || user?.uid || user?.id || 'NA';
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (activeTab === 'audit') {
                const response = await adminAPI.getAuditLogs({
                    userId: filters.search || undefined,
                    action: filters.action || undefined,
                    page: pagination.page,
                    limit: pagination.limit
                });
                setAuditLogs(response.data.data);
            } else if (activeTab === 'sync') {
                const response = await adminAPI.getSyncLogs({
                    page: pagination.page,
                    limit: pagination.limit
                });
                setSyncLogs(response.data.data);
            } else if (activeTab === 'suspicious') {
                const sessionIdFilter = String(filters.sessionId || '').trim();
                const response = await adminAPI.getSuspiciousActivities({
                    resolved: filters.resolved || undefined,
                    page: pagination.page,
                    limit: sessionIdFilter ? Math.max(pagination.limit, 200) : pagination.limit,
                    sessionId: sessionIdFilter || undefined
                });

                let items = response.data.data;
                if (sessionIdFilter) {
                    const normalized = String(sessionIdFilter).trim();
                    items = (items || []).filter((a) => String(getActivitySessionId(a) || '') === normalized);
                }
                setSuspiciousActivities(items || []);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    }, [activeTab, filters.action, filters.resolved, filters.search, filters.sessionId, pagination.limit, pagination.page]);

    useEffect(() => {
        if (activeTab !== 'suspicious') return;
        if (!Array.isArray(suspiciousActivities) || suspiciousActivities.length === 0) return;

        const uids = Array.from(new Set(suspiciousActivities
            .map(getActivityStudentUid)
            .filter(Boolean)
            .map((v) => String(v))
        ));

        const missing = uids.filter((uid) => !userCache[uid]);
        if (missing.length === 0) return;

        let cancelled = false;
        (async () => {
            try {
                const res = await adminAPI.getUsersBulk(missing);
                const usersMap = res?.data?.data?.users || {};
                const results = missing.map((uid) => ({ uid, user: usersMap[String(uid)] || null }));

                if (cancelled) return;
                setUserCache((prev) => {
                    const next = { ...prev };
                    results.forEach(({ uid, user }) => {
                        if (user) next[uid] = user;
                    });
                    return next;
                });
            } catch (e) {
                // Best-effort enrichment only.
                console.warn('Failed to hydrate student info:', e);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [activeTab, suspiciousActivities, userCache]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSearch = () => {
        if (pagination.page !== 1) {
            setPagination(prev => ({ ...prev, page: 1 }));
            return;
        }
        fetchData();
    };

    const handleResolveSuspicious = async (id) => {
        try {
            await adminAPI.resolveActivity(id, {
                resolutionNotes: 'Resolved by admin'
            });
            toast.success('Activity resolved');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to resolve activity');
        }
    };

    const getActionBadge = (action) => {
        const badges = {
            'LOGIN': 'badge-primary',
            'LOGOUT': 'badge-secondary',
            'CREATE': 'badge-success',
            'UPDATE': 'badge-warning',
            'DELETE': 'badge-danger',
            'EXPORT': 'badge-info'
        };
        return badges[action?.toUpperCase()] || 'badge-secondary';
    };

    const formatRoleLabel = (role) => {
        const r = String(role || '').trim();
        if (!r) return '';
        return r
            .replace(/_/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    };

    const formatActorLabel = (log) => {
        if (!log) return 'System';
        const name = log.user_name || log.userName || null;
        const roleLabel = formatRoleLabel(log.user_role || log.userRole);
        if (roleLabel && name) return `${roleLabel} • ${name}`;
        if (name) return String(name);
        if (roleLabel) return roleLabel;
        return log.user_id || log.user_uid || log.userId || 'System';
    };

    if (loading && (auditLogs.length === 0 && syncLogs.length === 0 && suspiciousActivities.length === 0)) {
        return (
            <div className="loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">System Monitoring</h1>
                <button className="btn btn-outline" onClick={fetchData}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            {/* Tabs */}
            <div className="tabs mb-4">
                <button
                    className={`tab ${activeTab === 'audit' ? 'active' : ''}`}
                    onClick={() => setActiveTab('audit')}
                >
                    <Activity size={16} /> Audit Logs
                </button>
                <button
                    className={`tab ${activeTab === 'sync' ? 'active' : ''}`}
                    onClick={() => setActiveTab('sync')}
                >
                    <RefreshCw size={16} /> Sync Logs
                </button>
                <button
                    className={`tab ${activeTab === 'suspicious' ? 'active' : ''}`}
                    onClick={() => setActiveTab('suspicious')}
                >
                    <AlertTriangle size={16} /> Suspicious Activities
                </button>
            </div>

            {/* Audit Logs Tab */}
            {activeTab === 'audit' && (
                <>
                    {/* Filters */}
                    <div className="card mb-4">
                        <div className="flex-center gap-4">
                            <Filter size={20} />
                            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Search by user or action..."
                                    value={filters.search}
                                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <select
                                    className="form-input"
                                    value={filters.action}
                                    onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                                >
                                    <option value="">All Actions</option>
                                    <option value="LOGIN">Login</option>
                                    <option value="LOGOUT">Logout</option>
                                    <option value="CREATE">Create</option>
                                    <option value="UPDATE">Update</option>
                                    <option value="DELETE">Delete</option>
                                </select>
                            </div>
                            <button className="btn btn-primary" onClick={handleSearch}>
                                <Search size={16} /> Search
                            </button>
                        </div>
                    </div>

                    <div className="card">
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Timestamp</th>
                                        <th>User</th>
                                        <th>Action</th>
                                        <th>Entity</th>
                                        <th>IP Address</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.length > 0 ? (
                                        auditLogs.map((log) => (
                                            <tr key={log.id}>
                                                <td>{log.created_at_ms ? new Date(log.created_at_ms).toLocaleString() : '-'}</td>
                                                <td>{formatActorLabel(log)}</td>
                                                <td>
                                                    <span className={`badge ${getActionBadge(log.action)}`}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td>{log.entity_type}</td>
                                                <td><code>{log.ip_address || '-'}</code></td>
                                                <td>
                                                    <button
                                                        className="btn btn-sm btn-outline"
                                                        onClick={() => setSelectedActivity(log)}
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="6" className="text-center">No audit logs found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Sync Logs Tab */}
            {activeTab === 'sync' && (
                <div className="card">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Device</th>
                                    <th>User</th>
                                    <th>Sync Type</th>
                                    <th>Records</th>
                                    <th>Status</th>
                                    <th>Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                {syncLogs.length > 0 ? (
                                    syncLogs.map((log) => (
                                        <tr key={log.id}>
                                            <td>{log.created_at_ms ? new Date(log.created_at_ms).toLocaleString() : '-'}</td>
                                            <td>
                                                <small>{(log.deviceId || log.device_id || '-').toString().slice(0, 8)}...</small>
                                            </td>
                                            <td>{log.studentId || log.userId || '-'}</td>
                                            <td>{log.type || log.sync_type || '-'}</td>
                                            <td>{log.records || log.records_synced || 0}</td>
                                            <td>
                                                <span className={`badge ${log.status === 'success' ? 'badge-success' : log.status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>
                                                    {log.status || 'unknown'}
                                                </span>
                                            </td>
                                            <td>
                                                -
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="7" className="text-center">No sync logs found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Suspicious Activities Tab */}
            {activeTab === 'suspicious' && (
                <>
                    {/* Filter */}
                    <div className="card mb-4">
                        <div className="flex-center gap-4">
                            <Filter size={20} />
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <select
                                    className="form-input"
                                    value={filters.resolved}
                                    onChange={(e) => {
                                        setFilters({ ...filters, resolved: e.target.value });
                                        setTimeout(fetchData, 0);
                                    }}
                                >
                                    <option value="">All</option>
                                    <option value="false">Pending</option>
                                    <option value="true">Resolved</option>
                                </select>
                            </div>

                            {filters.sessionId && (
                                <div className="flex-center gap-2" style={{ marginLeft: 'auto' }}>
                                    <span className="badge badge-info">Session: {filters.sessionId}</span>
                                    <button
                                        className="btn btn-sm btn-outline"
                                        onClick={() => {
                                            setFilters((prev) => ({ ...prev, sessionId: '' }));
                                            setPagination((prev) => ({ ...prev, page: 1, limit: 20 }));
                                            navigate('/admin/monitoring');
                                        }}
                                        title="Clear session filter"
                                    >
                                        Clear
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="card">
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Created At</th>
                                        <th>Student</th>
                                        <th>Session</th>
                                        <th>Type</th>
                                        <th>Severity</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {suspiciousActivities.length > 0 ? (
                                        suspiciousActivities.map((activity) => (
                                            <tr key={activity.id}>
                                                <td>{activity.created_at_ms ? new Date(activity.created_at_ms).toLocaleString() : '-'}</td>
                                                <td>
                                                    {(() => {
                                                        const uid = getActivityStudentUid(activity);
                                                        const user = uid ? userCache[String(uid)] : null;
                                                        const name = user ? formatUserName(user) : (activity.student_name || activity.studentName || uid || '-');
                                                        const email = user?.email || activity.student_email || activity.studentEmail || null;
                                                        return (
                                                            <div>
                                                                <div>{name}</div>
                                                                <small className="text-gray">{email || (uid ? String(uid).slice(0, 10) + '…' : '')}</small>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td>
                                                    {(() => {
                                                        const sid = getActivitySessionId(activity);
                                                        const code = activity.session_code || activity.sessionCode || null;
                                                        if (!sid) return '-';
                                                        return (
                                                            <div className="flex-center gap-2">
                                                                <code>{code || String(sid).slice(0, 8)}</code>
                                                                <button
                                                                    className="btn btn-sm btn-outline"
                                                                    onClick={() => navigate(`/teacher/sessions/${encodeURIComponent(String(sid))}/details`)}
                                                                    title="Open session details"
                                                                >
                                                                    Open
                                                                </button>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td>{activity.type || activity.reason || '-'}</td>
                                                <td>{activity.severity || '-'}</td>
                                                <td>
                                                    <span className={`badge ${activity.resolved ? 'badge-success' : 'badge-warning'}`}>
                                                        {activity.resolved ? 'resolved' : 'pending'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="flex-center gap-1">
                                                        {!activity.resolved && (
                                                            <button
                                                                className="btn btn-sm btn-success"
                                                                onClick={() => handleResolveSuspicious(activity.id)}
                                                                title="Mark as Resolved"
                                                            >
                                                                <CheckCircle size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            className="btn btn-sm btn-outline"
                                                            onClick={() => setSelectedActivity(activity)}
                                                            title="View Details"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="7" className="text-center">
                                                <div className="empty-state success">
                                                    <CheckCircle size={32} color="#22c55e" />
                                                    <p>No suspicious activities found</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Pagination (disabled when deep-linked session filter is active) */}
            {!filters.sessionId && (
                <div className="pagination mt-4">
                    <button
                        className="btn btn-sm btn-outline"
                        disabled={pagination.page === 1}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    >
                        Previous
                    </button>
                    <span>Page {pagination.page}</span>
                    <button
                        className="btn btn-sm btn-outline"
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Detail Modal */}
            {selectedActivity && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">Activity Details</h3>
                            <button className="modal-close" onClick={() => setSelectedActivity(null)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <pre className="code-block">
                                {JSON.stringify(selectedActivity, null, 2)}
                            </pre>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={() => setSelectedActivity(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Monitoring;
