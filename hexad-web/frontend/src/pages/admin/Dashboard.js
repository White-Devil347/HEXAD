import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { Users, Building, BookOpen, Activity, AlertTriangle, CheckCircle, Clock, Database } from 'lucide-react';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { subscribeSse } from '../../services/sse';

const AdminDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [storageHealth, setStorageHealth] = useState(null);
    const [systemHealth, setSystemHealth] = useState(null);
    const [recentActivities, setRecentActivities] = useState([]);
    const [suspiciousActivities, setSuspiciousActivities] = useState([]);
    const [loading, setLoading] = useState(true);

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

    const formatActorLabel = (activity) => {
        if (!activity) return 'System';
        const name = activity.user_name || activity.userName || null;
        const roleLabel = formatRoleLabel(activity.user_role || activity.userRole);
        if (roleLabel && name) return `${roleLabel} • ${name}`;
        if (name) return String(name);
        if (roleLabel) return roleLabel;
        return activity.user_id || activity.user_uid || activity.userId || 'System';
    };

    useEffect(() => {
        fetchDashboardData();
    }, []);

    // Live system health via SSE (admin only)
    useEffect(() => {
        const abort = new AbortController();
        let closed = false;

        (async () => {
            await subscribeSse({
                url: '/api/admin/health/stream',
                signal: abort.signal,
                onEvent: ({ event, data }) => {
                    if (closed) return;
                    if (event !== 'health') return;
                    if (!data || typeof data !== 'object') return;
                    setSystemHealth(data);
                },
                onError: (e) => {
                    if (closed) return;
                    console.warn('Admin health SSE failed:', e);
                }
            });
        })();

        return () => {
            closed = true;
            try { abort.abort(); } catch (_) { /* ignore */ }
        };
    }, []);

    const fetchDashboardData = async () => {
        try {
            const [statsRes, storageRes, auditRes, suspiciousRes] = await Promise.all([
                adminAPI.getDashboard(),
                adminAPI.getStorageHealth(),
                adminAPI.getAuditLogs({ limit: 5, fast: 'true' }),
                adminAPI.getSuspiciousActivities({ resolved: 'false', limit: 5 })
            ]);

            setStats(statsRes.data.data);
            setStorageHealth(storageRes.data.data);
            setRecentActivities(auditRes.data.data);
            setSuspiciousActivities(suspiciousRes.data.data);
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];
    const userDistributionData = stats?.users
        ? [
            { name: 'Students', value: stats.users.students || 0 },
            { name: 'Teachers', value: stats.users.teachers || 0 },
            { name: 'Admins', value: stats.users.admins || 0 }
        ]
        : [];

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
                <h1 className="page-title">Admin Dashboard</h1>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div
                    className="stat-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/admin/users')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/admin/users'); }}
                    aria-label="Go to Users"
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Total Users</div>
                            <div className="stat-value">{stats?.users?.total || 0}</div>
                            <small className="text-gray">
                                Teachers: {stats?.users?.teachers || 0} | Students: {stats?.users?.students || 0}
                            </small>
                        </div>
                        <Users size={32} color="#3b82f6" />
                    </div>
                </div>

                <div
                    className="stat-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/admin/institution#departments')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/admin/institution#departments'); }}
                    aria-label="Go to Departments"
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Departments</div>
                            <div className="stat-value">{stats?.counts?.departments || 0}</div>
                        </div>
                        <Building size={32} color="#22c55e" />
                    </div>
                </div>

                <div
                    className="stat-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/admin/institution#classes')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/admin/institution#classes'); }}
                    aria-label="Go to Classes"
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Classes</div>
                            <div className="stat-value">{stats?.counts?.classes || 0}</div>
                        </div>
                        <BookOpen size={32} color="#f59e0b" />
                    </div>
                </div>

                <div
                    className="stat-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/admin/monitoring')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/admin/monitoring'); }}
                    aria-label="Go to Monitoring"
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Sessions</div>
                            <div className="stat-value">{stats?.counts?.sessions || 0}</div>
                        </div>
                        <Activity size={32} color="#8b5cf6" />
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-2 mb-4">
                {/* User Distribution */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">User Distribution</h3>
                    </div>
                    {stats?.users ? (
                        <div>
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie
                                        data={userDistributionData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        dataKey="value"
                                        label={false}
                                        labelLine={false}
                                    >
                                        {userDistributionData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${entry.name}-${index}`}
                                                fill={COLORS[index % COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>

                            <div
                                className="text-gray"
                                style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    gap: '16px',
                                    flexWrap: 'wrap',
                                    paddingTop: '8px',
                                    fontSize: '0.875rem'
                                }}
                            >
                                {userDistributionData.map((d, i) => (
                                    <div
                                        key={`legend-${d.name}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        <span
                                            aria-hidden="true"
                                            style={{
                                                width: '10px',
                                                height: '10px',
                                                borderRadius: '9999px',
                                                backgroundColor: COLORS[i % COLORS.length],
                                                display: 'inline-block'
                                            }}
                                        />
                                        <span>{d.name}: {d.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">No data available</div>
                    )}
                </div>

                {/* Storage Health */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <Database size={20} /> Storage Health
                        </h3>
                    </div>
                    {storageHealth ? (
                        <div>
                            <div className="status-item" style={{ padding: '12px' }}>
                                <CheckCircle size={24} color="#22c55e" />
                                <span>Realtime Database</span>
                                <span className={`badge ${storageHealth.status === 'ok' ? 'badge-success' : 'badge-warning'}`}>
                                    {storageHealth.status || 'unknown'}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">No storage data</div>
                    )}
                </div>
            </div>

            {/* Recent Activity & Alerts */}
            <div className="grid grid-2">
                {/* Recent Activities */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <Clock size={20} /> Recent Activities
                        </h3>
                    </div>
                    {recentActivities.length > 0 ? (
                        <div className="activity-list">
                            {recentActivities.map((activity, index) => (
                                <div key={index} className="activity-item">
                                    <div className="activity-icon">
                                        <Activity size={16} />
                                    </div>
                                    <div className="activity-content">
                                        <div className="activity-action">{activity.action}</div>
                                        <small className="text-gray">
                                            {formatActorLabel(activity)} • {activity.created_at_ms ? new Date(activity.created_at_ms).toLocaleString() : '-'}
                                        </small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state">No recent activities</div>
                    )}
                </div>

                {/* Suspicious Activities */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <AlertTriangle size={20} color="#ef4444" /> Suspicious Activities
                        </h3>
                    </div>
                    {suspiciousActivities.length > 0 ? (
                        <div className="activity-list">
                            {suspiciousActivities.map((activity, index) => (
                                <div key={index} className="activity-item alert-item">
                                    <div className="activity-icon danger">
                                        <AlertTriangle size={16} />
                                    </div>
                                    <div className="activity-content">
                                        <div className="activity-action">{activity.type || activity.reason || 'Suspicious activity'}</div>
                                        <small className="text-gray">
                                            {activity.created_at_ms ? new Date(activity.created_at_ms).toLocaleString() : '-'}
                                        </small>
                                        <span className={`badge ${activity.resolved ? 'badge-success' : 'badge-warning'}`}>
                                            {activity.resolved ? 'resolved' : 'pending'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state success">
                            <CheckCircle size={32} color="#22c55e" />
                            <p>No suspicious activities</p>
                        </div>
                    )}
                </div>
            </div>

            {/* System Status */}
            <div className="card mt-4">
                <div className="card-header">
                    <h3 className="card-title">System Status</h3>
                </div>
                <div className="grid grid-4 gap-4">
                    <div className="status-item">
                        <CheckCircle size={24} color={systemHealth ? '#22c55e' : '#f59e0b'} />
                        <span>API Server</span>
                        <span className={`badge ${systemHealth ? 'badge-success' : 'badge-warning'}`}>
                            {systemHealth ? 'Online' : 'Unknown'}
                        </span>
                    </div>
                    <div className="status-item">
                        <CheckCircle size={24} color={systemHealth?.dbConnection === true ? '#22c55e' : systemHealth?.dbConnection === false ? '#ef4444' : '#f59e0b'} />
                        <span>Database</span>
                        <span className={`badge ${systemHealth?.dbConnection === true ? 'badge-success' : systemHealth?.dbConnection === false ? 'badge-danger' : 'badge-warning'}`}>
                            {systemHealth?.dbConnection === true ? 'Connected' : systemHealth?.dbConnection === false ? 'Disconnected' : 'Unknown'}
                        </span>
                    </div>
                    <div className="status-item">
                        <CheckCircle size={24} color={typeof systemHealth?.activeStreamsCount === 'number' ? '#22c55e' : '#f59e0b'} />
                        <span>Active Streams</span>
                        <span className={`badge ${typeof systemHealth?.activeStreamsCount === 'number' ? 'badge-info' : 'badge-warning'}`}>
                            {typeof systemHealth?.activeStreamsCount === 'number' ? systemHealth.activeStreamsCount : 'Unknown'}
                        </span>
                    </div>
                    <div className="status-item">
                        <CheckCircle
                            size={24}
                            color={
                                systemHealth?.lastWriteTestTimestampMs
                                    ? (Date.now() - systemHealth.lastWriteTestTimestampMs < 60_000 ? '#22c55e' : '#f59e0b')
                                    : '#f59e0b'
                            }
                        />
                        <span>DB Write Test</span>
                        <span
                            className={`badge ${
                                systemHealth?.lastWriteTestTimestampMs
                                    ? (Date.now() - systemHealth.lastWriteTestTimestampMs < 60_000 ? 'badge-success' : 'badge-warning')
                                    : 'badge-warning'
                            }`}
                            title={systemHealth?.lastWriteTestTimestamp || ''}
                        >
                            {systemHealth?.lastWriteTestTimestampMs
                                ? (Date.now() - systemHealth.lastWriteTestTimestampMs < 60_000 ? 'OK' : 'Stale')
                                : 'Unknown'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
