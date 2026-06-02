import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teacherAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const AssignedClasses = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const toastRef = useRef(toast);

    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        toastRef.current = toast;
    }, [toast]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            try {
                const res = await teacherAPI.getAssignments();
                if (cancelled) return;
                setAssignments(res.data.data || []);
            } catch (error) {
                console.error('Failed to fetch assignments:', error);
                toastRef.current?.error?.(error.response?.data?.message || 'Failed to fetch assignments');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    const uniqueAssignments = useMemo(() => {
        const byKey = new Map();
        for (const a of assignments || []) {
            const key = `${String(a?.class_id || '')}|${String(a?.subject_id || '')}`;
            if (!byKey.has(key)) byKey.set(key, a);
        }
        return Array.from(byKey.values());
    }, [assignments]);

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
                <h1 className="page-title">Assigned Classes</h1>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">My Assignments</h3>
                </div>

                {uniqueAssignments.length > 0 ? (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Department</th>
                                    <th>Class</th>
                                    <th>Subject</th>
                                    <th>Students</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {uniqueAssignments.map((a) => (
                                    <tr key={a.id}>
                                        <td>{a.department_name || '-'}</td>
                                        <td>{a.class_name || a.class_code || '-'}</td>
                                        <td>{a.subject_name || a.subject_code || '-'}</td>
                                        <td>{a.student_count ?? '-'}</td>
                                        <td>
                                            <div className="flex-center gap-1">
                                                <button
                                                    className="btn btn-sm btn-outline"
                                                    type="button"
                                                    onClick={() => navigate(`/teacher/sessions?classId=${encodeURIComponent(String(a.class_id))}&subjectId=${encodeURIComponent(String(a.subject_id))}`)}
                                                    title="View sessions for this class"
                                                >
                                                    View Sessions
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-primary"
                                                    type="button"
                                                    onClick={() => navigate(`/teacher/sessions?create=1&assignmentId=${encodeURIComponent(String(a.id))}`)}
                                                    title="Create a session for this assignment"
                                                >
                                                    Create Session
                                                </button>
                                            </div>
                                        </td>
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
    );
};

export default AssignedClasses;
