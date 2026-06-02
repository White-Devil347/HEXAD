import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { teacherAPI } from '../../services/api';
import { subscribeSse } from '../../services/sse';
import { Calendar, Users, CheckCircle, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const TeacherDashboard = () => {
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [recentSessions, setRecentSessions] = useState([]);
    const [upcomingSessions, setUpcomingSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    // Realtime recent sessions (SSE only while dashboard is mounted)
    useEffect(() => {
        const abort = new AbortController();
        let closed = false;

        (async () => {
            await subscribeSse({
                url: '/api/teacher/dashboard/stream',
                signal: abort.signal,
                onEvent: ({ event, data }) => {
                    if (closed) return;
                    if (event !== 'dashboard') return;
                    if (!data || typeof data !== 'object') return;
                    if (Array.isArray(data.recentSessions)) {
                        setRecentSessions(data.recentSessions);
                    }
                },
                onError: (e) => {
                    if (closed) return;
                    console.warn('Teacher dashboard SSE failed:', e);
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
            const todayIso = new Date().toISOString().split('T')[0];
            const [analyticsRes, assignmentsRes, sessionsRes, upcomingRes] = await Promise.all([
                teacherAPI.getAnalytics({ period: 'month' }),
                teacherAPI.getAssignments(),
                teacherAPI.getSessions({ page: 1, limit: 5 }),
                teacherAPI.getSessions({ page: 1, limit: 25, start_date: todayIso })
            ]);
            
            setAnalytics(analyticsRes.data.data);
            setAssignments(assignmentsRes.data.data);
            setRecentSessions(sessionsRes.data.data || []);

            const rawUpcoming = upcomingRes.data.data || [];
            const today = todayIso;
            const filteredUpcoming = rawUpcoming
                .filter((s) => {
                    if (!s) return false;
                    const date = String(s.session_date || '').slice(0, 10);
                    const status = String(s.status || '').toLowerCase();
                    if (!date) return false;
                    if (date > today) return status === 'scheduled';
                    if (date === today) return status === 'scheduled' || status === 'active';
                    return false;
                })
                .sort((a, b) => {
                    const aDate = String(a.session_date || '');
                    const bDate = String(b.session_date || '');
                    if (aDate !== bDate) return aDate.localeCompare(bDate);
                    const aTime = String(a.start_time || '');
                    const bTime = String(b.start_time || '');
                    return aTime.localeCompare(bTime);
                })
                .slice(0, 8);

            setUpcomingSessions(filteredUpcoming);
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
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
                <h1 className="page-title">Teacher Dashboard</h1>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div
                    className="stat-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/teacher/sessions')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/teacher/sessions'); }}
                    aria-label="Go to Sessions"
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Total Sessions</div>
                            <div className="stat-value">{analytics?.summary?.totalSessions || 0}</div>
                        </div>
                        <Calendar size={32} color="#3b82f6" />
                    </div>
                </div>
                
                <div
                    className="stat-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/teacher/analytics')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/teacher/analytics'); }}
                    aria-label="Go to Analytics"
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Attendance Rate</div>
                            <div className="stat-value">{analytics?.summary?.attendancePercentage || 0}%</div>
                        </div>
                        <TrendingUp size={32} color="#22c55e" />
                    </div>
                </div>
                
                <div
                    className="stat-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/teacher/assigned-classes')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/teacher/assigned-classes'); }}
                    aria-label="Go to Assigned Classes"
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Assigned Classes</div>
                            <div className="stat-value">{new Set(assignments.map(a => a.class_id)).size}</div>
                        </div>
                        <Users size={32} color="#f59e0b" />
                    </div>
                </div>
                
                <div
                    className="stat-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/teacher/analytics')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/teacher/analytics'); }}
                    aria-label="Go to Analytics"
                >
                    <div className="flex-between">
                        <div>
                            <div className="stat-label">Verified Attendance</div>
                            <div className="stat-value">
                                {analytics?.verificationStats?.find(v => v.verification_status === 'verified')?.count || 0}
                            </div>
                        </div>
                        <CheckCircle size={32} color="#22c55e" />
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-2 mb-4">
                {/* Daily Trend Chart */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Daily Attendance Trend</h3>
                    </div>
                    {analytics?.dailyTrend?.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={analytics.dailyTrend.slice(-14)}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="date" 
                                    tickFormatter={(value) => new Date(value).toLocaleDateString('en', { day: '2-digit', month: 'short' })}
                                />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="percentage" fill="#3b82f6" name="Attendance %" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="empty-state">No data available</div>
                    )}
                </div>

                {/* Upcoming Sessions */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Upcoming Sessions</h3>
                    </div>
                    {upcomingSessions.length > 0 ? (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Class</th>
                                        <th>Subject</th>
                                        <th>Time</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {upcomingSessions.map((s) => (
                                        <tr
                                            key={s.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => navigate(`/teacher/sessions/${s.id}/details`)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') navigate(`/teacher/sessions/${s.id}/details`);
                                            }}
                                            style={{ cursor: 'pointer' }}
                                            title="Open session details"
                                        >
                                            <td>{s.session_date || 'NA'}</td>
                                            <td>{s.class_name || 'NA'}</td>
                                            <td>{s.subject_name || 'NA'}</td>
                                            <td>
                                                <small className="text-gray">
                                                    {(s.start_time || '').slice(0, 5)}{s.end_time ? ` - ${String(s.end_time).slice(0, 5)}` : ''}
                                                </small>
                                            </td>
                                            <td>
                                                <span className={`badge ${String(s.status).toLowerCase() === 'active' ? 'badge-success' : 'badge-warning'}`}>
                                                    {s.status || 'NA'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state">No upcoming sessions</div>
                    )}
                </div>
            </div>

            {/* Recent Sessions and Assignments */}
            <div className="grid grid-2">
                {/* Recent Sessions (DB-driven counts) */}
                <div className="card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 className="card-title">Recent Sessions</h3>
                        <button className="btn btn-sm btn-outline" onClick={() => navigate('/teacher/sessions')}>View all</button>
                    </div>

                    {recentSessions.length > 0 ? (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Class</th>
                                        <th>Subject</th>
                                        <th>Status</th>
                                        <th>Attendance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentSessions.map((s) => (
                                        <tr
                                            key={s.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => navigate(`/teacher/sessions/${s.id}/details`)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/teacher/sessions/${s.id}/details`); }}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <td>{s.session_date || 'NA'}</td>
                                            <td>{s.class_name || 'NA'}</td>
                                            <td>{s.subject_name || 'NA'}</td>
                                            <td><span className={`badge ${s.status === 'active' ? 'badge-success' : s.status === 'completed' ? 'badge-primary' : 'badge-secondary'}`}>{s.status || 'NA'}</span></td>
                                            <td>{s.attendance_count ?? 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state">No sessions found</div>
                    )}
                </div>

                {/* Class Assignments */}
                <div className="card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 className="card-title">My Assignments</h3>
                        <button className="btn btn-sm btn-outline" onClick={() => navigate('/teacher/insights')}>Insights</button>
                    </div>
                    {assignments.length > 0 ? (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Class</th>
                                        <th>Subject</th>
                                        <th>Students</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {assignments.map((assignment) => (
                                        <tr
                                            key={assignment.id}
                                            role="button"
                                            tabIndex={0}
                                            style={{ cursor: 'pointer' }}
                                            title="View assigned classes"
                                            onClick={() => navigate('/teacher/assigned-classes')}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    navigate('/teacher/assigned-classes');
                                                }
                                            }}
                                        >
                                            <td>{assignment.class_name}</td>
                                            <td>{assignment.subject_name}</td>
                                            <td>{assignment.student_count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state">No assignments found</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TeacherDashboard;
