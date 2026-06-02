import React, { useEffect, useMemo, useState } from 'react';
import { superadminAPI } from '../../services/api';

const SuperAdminDashboard = () => {
    const [colleges, setColleges] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [collegeName, setCollegeName] = useState('');
    const [creatingCollege, setCreatingCollege] = useState(false);

    const [adminEmail, setAdminEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [adminCollegeId, setAdminCollegeId] = useState('');
    const [creatingAdmin, setCreatingAdmin] = useState(false);

    const collegeOptions = useMemo(() => colleges.map((c) => ({ value: c.collegeId, label: c.name })), [colleges]);

    const refresh = async () => {
        setError('');
        setLoading(true);
        try {
            const res = await superadminAPI.getColleges();
            setColleges(res.data?.data || []);
            if (!adminCollegeId && (res.data?.data || []).length > 0) {
                setAdminCollegeId((res.data?.data || [])[0].collegeId);
            }
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load colleges');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCreateCollege = async (e) => {
        e.preventDefault();
        setError('');
        setCreatingCollege(true);
        try {
            await superadminAPI.createCollege({ name: collegeName });
            setCollegeName('');
            await refresh();
        } catch (e2) {
            setError(e2.response?.data?.message || 'Failed to create college');
        } finally {
            setCreatingCollege(false);
        }
    };

    const handleCreateAdmin = async (e) => {
        e.preventDefault();
        setError('');
        setCreatingAdmin(true);
        try {
            await superadminAPI.createAdmin({
                email: adminEmail,
                password: adminPassword,
                collegeId: adminCollegeId
            });
            setAdminEmail('');
            setAdminPassword('');
            await refresh();
        } catch (e2) {
            setError(e2.response?.data?.message || 'Failed to create admin');
        } finally {
            setCreatingAdmin(false);
        }
    };

    const handleToggleCollege = async (collegeId, currentIsActive) => {
        setError('');
        try {
            await superadminAPI.setCollegeStatus(collegeId, !currentIsActive);
            setColleges((prev) => prev.map((c) => (c.collegeId === collegeId ? { ...c, isActive: !currentIsActive } : c)));
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to update status');
        }
    };

    return (
        <div className="page">
            <div className="page-header">
                <h1 className="page-title">SuperAdmin</h1>
                <button className="btn btn-secondary" onClick={refresh} disabled={loading}>
                    Refresh
                </button>
            </div>

            {error ? (
                <div className="alert alert-danger">{error}</div>
            ) : null}

            <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="card">
                    <div className="card-header">
                        <h2 className="card-title">Create College</h2>
                    </div>
                    <div className="card-body">
                        <form onSubmit={handleCreateCollege}>
                            <div className="form-group">
                                <label className="form-label">College Name</label>
                                <input
                                    className="form-input"
                                    value={collegeName}
                                    onChange={(e) => setCollegeName(e.target.value)}
                                    placeholder="Enter college name"
                                    required
                                />
                            </div>
                            <button className="btn btn-primary" type="submit" disabled={creatingCollege}>
                                {creatingCollege ? 'Creating…' : 'Create'}
                            </button>
                        </form>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h2 className="card-title">Create College Admin</h2>
                    </div>
                    <div className="card-body">
                        <form onSubmit={handleCreateAdmin}>
                            <div className="form-group">
                                <label className="form-label">College</label>
                                <select
                                    className="form-input"
                                    value={adminCollegeId}
                                    onChange={(e) => setAdminCollegeId(e.target.value)}
                                    required
                                >
                                    {collegeOptions.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Email</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    value={adminEmail}
                                    onChange={(e) => setAdminEmail(e.target.value)}
                                    placeholder="admin@college.edu"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Password</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    value={adminPassword}
                                    onChange={(e) => setAdminPassword(e.target.value)}
                                    placeholder="Minimum 6 characters"
                                    required
                                />
                            </div>

                            <button className="btn btn-primary" type="submit" disabled={creatingAdmin}>
                                {creatingAdmin ? 'Creating…' : 'Create Admin'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-header">
                    <h2 className="card-title">Colleges</h2>
                </div>
                <div className="card-body">
                    {loading ? (
                        <div className="loading">
                            <div className="spinner" />
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Name</th>
                                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>College ID</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem' }}>Admins</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem' }}>Departments</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem' }}>Sessions</th>
                                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {colleges.map((c) => (
                                        <tr key={c.collegeId}>
                                            <td style={{ padding: '0.5rem' }}>{c.name}</td>
                                            <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{c.collegeId}</td>
                                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>{c.adminsCount ?? 0}</td>
                                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>{c.departmentsCount ?? 0}</td>
                                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>{c.sessionsCount ?? 0}</td>
                                            <td style={{ padding: '0.5rem' }}>
                                                {c.isActive ? 'Active' : 'Inactive'}
                                            </td>
                                            <td style={{ padding: '0.5rem' }}>
                                                <button
                                                    className="btn btn-secondary"
                                                    onClick={() => handleToggleCollege(c.collegeId, c.isActive)}
                                                >
                                                    {c.isActive ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SuperAdminDashboard;
