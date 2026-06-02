import React, { useState, useEffect, useCallback } from 'react';
import { teacherAPI } from '../../services/api';
import { TrendingUp, Users, Calendar, Filter } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

const Analytics = () => {
    const [analytics, setAnalytics] = useState(null);
    const [studentAnalytics, setStudentAnalytics] = useState(null);
    const [heatmapData, setHeatmapData] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        period: 'month',
        class_id: '',
        subject_id: ''
    });
    const [activeTab, setActiveTab] = useState('overview');

    const fetchAssignments = useCallback(async () => {
        try {
            const response = await teacherAPI.getAssignments();
            setAssignments(response.data.data);
        } catch (error) {
            console.error('Failed to fetch assignments:', error);
        }
    }, []);

    const fetchAnalytics = useCallback(async () => {
        setLoading(true);
        try {
            const [analyticsRes, heatmapRes] = await Promise.all([
                teacherAPI.getAnalytics(filters),
                teacherAPI.getHeatmap(filters)
            ]);
            setAnalytics(analyticsRes.data.data);
            setHeatmapData(heatmapRes.data.data);

            if (filters.class_id) {
                const studentRes = await teacherAPI.getStudentAnalytics({
                    ...filters,
                    class_id: filters.class_id
                });
                setStudentAnalytics(studentRes.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchAssignments();
    }, [fetchAssignments]);

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

    const uniqueClasses = [...new Map(assignments.map(a => [a.class_id, { id: a.class_id, name: a.class_name }])).values()];
    const uniqueSubjects = [...new Map(assignments.map(a => [a.subject_id, { id: a.subject_id, name: a.subject_name }])).values()];

    // Release rule: treat verification_status=flagged as absent (until manually overridden).
    const verificationStats = Array.isArray(analytics?.verificationStats) ? analytics.verificationStats : [];
    const getVerificationCount = (verificationStatus) => {
        const vs = String(verificationStatus || '').toLowerCase();
        const match = verificationStats.find((e) => String(e?.verification_status || '').toLowerCase() === vs);
        return Number(match?.count || 0);
    };

    const flaggedCount = getVerificationCount('flagged');
    const adjustedPresentCount = Math.max(0, Number(analytics?.summary?.presentCount || 0) - flaggedCount);

    const statusDistribution = Array.isArray(analytics?.statusDistribution) ? analytics.statusDistribution : [];
    const statusCount = (status) => {
        const s = String(status || '').toLowerCase();
        const match = statusDistribution.find((e) => String(e?.status || '').toLowerCase() === s);
        return Number(match?.count || 0);
    };

    const basePresent = statusCount('present') + statusCount('late');
    const baseAbsent = statusCount('absent');
    const effectivePresent = Math.max(0, basePresent - flaggedCount);
    const effectiveAbsent = baseAbsent + flaggedCount;
    const effectiveTotal = effectivePresent + effectiveAbsent;
    const effectiveAttendancePercentage = effectiveTotal ? Math.round((effectivePresent / effectiveTotal) * 100) : (analytics?.summary?.attendancePercentage || 0);

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
                <h1 className="page-title">Attendance Analytics</h1>
            </div>

            {/* Filters */}
            <div className="card mb-4">
                <div className="flex-center gap-4">
                    <Filter size={20} />
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <select
                            className="form-input"
                            value={filters.period}
                            onChange={(e) => setFilters({ ...filters, period: e.target.value })}
                        >
                            <option value="week">Last Week</option>
                            <option value="month">Last Month</option>
                            <option value="semester">Semester</option>
                            <option value="year">Year</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <select
                            className="form-input"
                            value={filters.class_id}
                            onChange={(e) => setFilters({ ...filters, class_id: e.target.value })}
                        >
                            <option value="">All Classes</option>
                            {uniqueClasses.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <select
                            className="form-input"
                            value={filters.subject_id}
                            onChange={(e) => setFilters({ ...filters, subject_id: e.target.value })}
                        >
                            <option value="">All Subjects</option>
                            {uniqueSubjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs mb-4">
                <button
                    className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    Overview
                </button>
                <button
                    className={`tab ${activeTab === 'trends' ? 'active' : ''}`}
                    onClick={() => setActiveTab('trends')}
                >
                    Trends
                </button>
                <button
                    className={`tab ${activeTab === 'students' ? 'active' : ''}`}
                    onClick={() => setActiveTab('students')}
                    disabled={!filters.class_id}
                >
                    Students
                </button>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div>
                    {/* Stats Cards */}
                    <div className="stats-grid mb-4">
                        <div className="stat-card">
                            <div className="flex-between">
                                <div>
                                    <div className="stat-label">Total Sessions</div>
                                    <div className="stat-value">{analytics?.summary?.totalSessions || 0}</div>
                                </div>
                                <Calendar size={32} color="#3b82f6" />
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="flex-between">
                                <div>
                                    <div className="stat-label">Avg Attendance</div>
                                    <div className="stat-value">{effectiveAttendancePercentage}%</div>
                                </div>
                                <TrendingUp size={32} color="#22c55e" />
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="flex-between">
                                <div>
                                    <div className="stat-label">Total Records</div>
                                    <div className="stat-value">{analytics?.summary?.totalRecords || 0}</div>
                                </div>
                                <Users size={32} color="#f59e0b" />
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="flex-between">
                                <div>
                                    <div className="stat-label">Present Count (excl. flagged)</div>
                                    <div className="stat-value">{adjustedPresentCount}</div>
                                </div>
                                <Users size={32} color="#22c55e" />
                            </div>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-2">
                        {/* Status Distribution */}
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">Status Distribution</h3>
                            </div>
                            {analytics?.statusDistribution?.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={analytics.statusDistribution}
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={100}
                                            dataKey="count"
                                            nameKey="status"
                                            label={({ status, count }) => `${status}: ${count}`}
                                        >
                                            {analytics.statusDistribution.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="empty-state">No data available</div>
                            )}
                        </div>

                        {/* Verification Stats */}
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">Verification Status</h3>
                            </div>
                            {analytics?.verificationStats?.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={analytics.verificationStats}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="verification_status" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="count" fill="#3b82f6" />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="empty-state">No data available</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Trends Tab */}
            {activeTab === 'trends' && (
                <div>
                    {/* Daily Trend */}
                    <div className="card mb-4">
                        <div className="card-header">
                            <h3 className="card-title">Daily Attendance Trend</h3>
                        </div>
                        {analytics?.dailyTrend?.length > 0 ? (
                            <ResponsiveContainer width="100%" height={350}>
                                <LineChart data={analytics.dailyTrend}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(value) => new Date(value).toLocaleDateString('en', { day: '2-digit', month: 'short' })}
                                    />
                                    <YAxis domain={[0, 100]} />
                                    <Tooltip
                                        formatter={(value) => [`${value}%`, 'Attendance']}
                                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="percentage"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        dot={{ r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="empty-state">No trend data available</div>
                        )}
                    </div>

                    {/* Heatmap */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">Weekly Pattern</h3>
                        </div>
                        {heatmapData?.length > 0 ? (
                            <div className="heatmap-container">
                                <div className="heatmap-grid">
                                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => {
                                        const dayData = heatmapData.find(d => d.day_of_week === day);
                                        const percentage = dayData?.attendance_percentage || 0;
                                        const bgColor = percentage >= 80 ? '#22c55e' :
                                            percentage >= 60 ? '#84cc16' :
                                                percentage >= 40 ? '#f59e0b' :
                                                    percentage >= 20 ? '#f97316' : '#ef4444';
                                        return (
                                            <div
                                                key={day}
                                                className="heatmap-cell"
                                                style={{ backgroundColor: bgColor }}
                                                title={`${day}: ${percentage.toFixed(1)}%`}
                                            >
                                                <div className="heatmap-day">{day}</div>
                                                <div className="heatmap-value">{percentage.toFixed(0)}%</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="empty-state">No weekly pattern data</div>
                        )}
                    </div>
                </div>
            )}

            {/* Students Tab */}
            {activeTab === 'students' && (
                <div>
                    {!filters.class_id ? (
                        <div className="alert alert-warning">
                            Please select a class to view student analytics
                        </div>
                    ) : studentAnalytics?.length > 0 ? (
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">Student Attendance Summary</h3>
                            </div>
                            <div className="table-container">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Roll No</th>
                                            <th>Student Name</th>
                                            <th>Total Sessions</th>
                                            <th>Present</th>
                                            <th>Late</th>
                                            <th>Absent</th>
                                            <th>Attendance %</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {studentAnalytics.map((student) => (
                                            <tr key={student.student_id}>
                                                <td>{student.roll_number}</td>
                                                <td>{student.student_name}</td>
                                                <td>{student.total_sessions}</td>
                                                <td className="text-success">{student.present_count}</td>
                                                <td className="text-warning">{student.late_count}</td>
                                                <td className="text-danger">{student.absent_count}</td>
                                                <td>
                                                    <div className="progress-bar-container">
                                                        <div
                                                            className="progress-bar"
                                                            style={{
                                                                width: `${student.attendance_percentage}%`,
                                                                backgroundColor: student.attendance_percentage >= 75 ? '#22c55e' :
                                                                    student.attendance_percentage >= 50 ? '#f59e0b' : '#ef4444'
                                                            }}
                                                        />
                                                        <span className="progress-text">{student.attendance_percentage.toFixed(1)}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <Users size={48} />
                            <p>No student data available for the selected class</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Analytics;
