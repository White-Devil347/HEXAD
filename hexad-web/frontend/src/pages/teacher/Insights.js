import React, { useEffect, useState } from 'react';
import { teacherAPI } from '../../services/api';
import { CheckCircle, AlertCircle } from 'lucide-react';

const TeacherInsights = () => {
    const [loading, setLoading] = useState(true);
    const [weekInsights, setWeekInsights] = useState(null);
    const [monthInsights, setMonthInsights] = useState(null);
    const [weekAnalytics, setWeekAnalytics] = useState(null);
    const [monthAnalytics, setMonthAnalytics] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [wkI, moI, wkA, moA] = await Promise.all([
                    teacherAPI.getInsights({ period: 'week' }),
                    teacherAPI.getInsights({ period: 'month' }),
                    teacherAPI.getAnalytics({ period: 'week' }),
                    teacherAPI.getAnalytics({ period: 'month' })
                ]);
                if (cancelled) return;
                setWeekInsights(wkI.data.data);
                setMonthInsights(moI.data.data);
                setWeekAnalytics(wkA.data.data);
                setMonthAnalytics(moA.data.data);
            } catch (e) {
                // Best-effort page only.
                console.error('Failed to load insights:', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const renderInsightList = (insights) => {
        const list = insights?.insights || [];
        if (!Array.isArray(list) || list.length === 0) {
            return (
                <div className="empty-state">
                    <CheckCircle size={48} />
                    <p>No alerts or insights at this time</p>
                </div>
            );
        }

        return (
            <div>
                {list.map((insight, index) => (
                    <div key={index} className={`alert alert-${insight.type === 'positive' ? 'success' : insight.type === 'warning' ? 'warning' : insight.type === 'alert' ? 'danger' : 'info'}`}>
                        {insight.type === 'positive' && <CheckCircle size={16} />}
                        {insight.type !== 'positive' && <AlertCircle size={16} />}
                        <span style={{ marginLeft: '0.5rem' }}>{insight.message}</span>
                    </div>
                ))}
                <p className="text-xs text-gray mt-2">
                    * These are automated summaries for informational purposes only.
                </p>
            </div>
        );
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
                <h1 className="page-title">Insights</h1>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">7 Day Attendance Rate</div>
                    <div className="stat-value">{weekAnalytics?.summary?.attendancePercentage || 0}%</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">30 Day Attendance Rate</div>
                    <div className="stat-value">{monthAnalytics?.summary?.attendancePercentage || 0}%</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">7 Day Sessions</div>
                    <div className="stat-value">{weekAnalytics?.summary?.totalSessions || 0}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">30 Day Sessions</div>
                    <div className="stat-value">{monthAnalytics?.summary?.totalSessions || 0}</div>
                </div>
            </div>

            <div className="grid grid-2">
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">7 Day Insights</h3>
                    </div>
                    {renderInsightList(weekInsights)}
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">30 Day Insights</h3>
                    </div>
                    {renderInsightList(monthInsights)}
                </div>
            </div>

            <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-header">
                    <h3 className="card-title">Behavior Analysis</h3>
                </div>
                <div className="text-gray">
                    This section is based on aggregated attendance patterns and automated summaries.
                </div>
            </div>
        </div>
    );
};

export default TeacherInsights;
