import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { 
    LayoutDashboard, 
    Calendar, 
    Users, 
    BarChart3, 
    FileText, 
    Lightbulb,
    Settings,
    Building2,
    LogOut,
    Activity,
    Bell
} from 'lucide-react';

const ContentLoading = () => (
    <div className="page-skeleton" aria-busy="true" aria-live="polite">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-subtitle" />
        <div className="skeleton-grid">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
        </div>
    </div>
);

const Layout = () => {
    const { user, logout, isTeacher, isAdmin, isSuperAdmin } = useAuth();
    const navigate = useNavigate();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);

    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState(null);
    const [profile, setProfile] = useState(null);

    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);

    const greeting = useMemo(() => {
        const hour = now.getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    }, [now]);

    const displayName = useMemo(() => {
        const first = user?.firstName ? String(user.firstName).trim() : '';
        const last = user?.lastName ? String(user.lastName).trim() : '';
        const full = `${first} ${last}`.trim();
        return full || 'User';
    }, [user?.firstName, user?.lastName]);

    const emailLabel = useMemo(() => {
        const email = user?.email ? String(user.email).trim() : '';
        return email || 'NA';
    }, [user?.email]);

    const dateLabel = useMemo(() => {
        const date = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' });
        const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        return `${date} • ${time}`;
    }, [now]);

    const loadProfile = async () => {
        setProfileLoading(true);
        setProfileError(null);
        try {
            const res = await authAPI.getProfile();
            setProfile(res?.data?.data || null);
        } catch (e) {
            setProfile(null);
            setProfileError(e?.response?.data?.message || 'Failed to load profile');
        } finally {
            setProfileLoading(false);
        }
    };

    const openSettings = async () => {
        setSettingsOpen(true);
        // Best-effort refresh so the panel always shows current data.
        await loadProfile();
    };

    const handleLogout = async () => {
        setLoggingOut(true);
        try {
            await logout();
        } finally {
            setLoggingOut(false);
            setShowLogoutConfirm(false);
            navigate('/login');
        }
    };

    const teacherLinks = [
        { to: '/teacher/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/teacher/sessions', icon: Calendar, label: 'Sessions' },
        { to: '/teacher/assigned-classes', icon: Users, label: 'Assigned Classes' },
        { to: '/teacher/analytics', icon: BarChart3, label: 'Analytics' },
        { to: '/teacher/insights', icon: Lightbulb, label: 'Insights' },
        { to: '/teacher/reports', icon: FileText, label: 'Reports' }
    ];

    const adminLinks = [
        { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/admin/users', icon: Users, label: 'Users' },
        { to: '/admin/institution', icon: Building2, label: 'Institution' },
        { to: '/admin/configuration', icon: Settings, label: 'Configuration' },
        { to: '/admin/monitoring', icon: Activity, label: 'Monitoring' }
    ];

    const superAdminLinks = [
        { to: '/superadmin', icon: LayoutDashboard, label: 'SuperAdmin' }
    ];

    const links = isSuperAdmin ? superAdminLinks : (isTeacher && !isAdmin ? teacherLinks : adminLinks);

    return (
        <div className="app-layout">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <span>HEXAD</span>
                    </div>
                    <div className="text-sm text-gray mt-2">
                        {user?.firstName} {user?.lastName}
                        <br />
                        <span className="badge badge-info">{user?.role}</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {links.map((link) => (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                        >
                            <link.icon size={18} />
                            {link.label}
                        </NavLink>
                    ))}
                </nav>

                <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--gray-700)' }}>
                    <button
                        type="button"
                        onClick={() => setShowLogoutConfirm(true)}
                        className="nav-link nav-link-logout"
                    >
                        <LogOut size={18} />
                        Logout
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar" aria-label="Top bar">
                    <div>
                        <div className="topbar-title">{greeting}, {displayName}</div>
                        <div className="topbar-subtitle">{dateLabel}</div>
                    </div>

                    <div className="topbar-search">
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search students, classes..."
                            aria-label="Search"
                        />
                    </div>

                    <div className="topbar-actions">
                        <button
                            type="button"
                            className="icon-btn"
                            title="Notifications"
                            aria-label="Notifications"
                            onClick={() => setNotificationsOpen(true)}
                        >
                            <Bell size={18} />
                        </button>
                        <button
                            type="button"
                            className="icon-btn"
                            title="Settings"
                            aria-label="Settings"
                            onClick={openSettings}
                        >
                            <Settings size={18} />
                        </button>
                    </div>
                </header>

                <Suspense fallback={<ContentLoading />}>
                    <Outlet />
                </Suspense>
            </main>

            {showLogoutConfirm && (
                <div
                    className="modal-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Confirm logout"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget && !loggingOut) setShowLogoutConfirm(false);
                    }}
                >
                    <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Confirm Logout</h3>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => !loggingOut && setShowLogoutConfirm(false)}
                                aria-label="Close"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="text-gray">Are you sure you want to logout?</div>

                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => setShowLogoutConfirm(false)}
                                disabled={loggingOut}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={handleLogout}
                                disabled={loggingOut}
                            >
                                {loggingOut ? 'Logging out...' : 'Logout'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {notificationsOpen && (
                <div
                    className="modal-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Notifications"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setNotificationsOpen(false);
                    }}
                >
                    <div className="modal" style={{ maxWidth: '720px' }} onMouseDown={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Notifications</h3>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setNotificationsOpen(false)}
                                aria-label="Close"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="empty-state">No notifications yet</div>

                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline" onClick={() => setNotificationsOpen(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {settingsOpen && (
                <div
                    className="modal-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Settings"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget && !profileLoading) setSettingsOpen(false);
                    }}
                >
                    <div className="modal" style={{ maxWidth: '820px' }} onMouseDown={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Settings</h3>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => !profileLoading && setSettingsOpen(false)}
                                aria-label="Close"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="card" style={{ background: 'var(--gray-50)', boxShadow: 'none' }}>
                            <div className="card-header">
                                <h3 className="card-title">Account</h3>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline"
                                    onClick={loadProfile}
                                    disabled={profileLoading}
                                >
                                    {profileLoading ? 'Refreshing...' : 'Refresh'}
                                </button>
                            </div>

                            {profileError && (
                                <div className="text-danger" style={{ marginBottom: '0.75rem' }}>{profileError}</div>
                            )}

                            <div className="grid grid-2 gap-2">
                                <div className="kv">
                                    <div className="kv-label">Name</div>
                                    <div className="kv-value">{displayName}</div>
                                </div>
                                <div className="kv">
                                    <div className="kv-label">Email</div>
                                    <div className="kv-value">{profile?.email || emailLabel}</div>
                                </div>
                                <div className="kv">
                                    <div className="kv-label">Role</div>
                                    <div className="kv-value">{user?.role || profile?.role || 'NA'}</div>
                                </div>
                                <div className="kv">
                                    <div className="kv-label">College</div>
                                    <div className="kv-value">{user?.collegeId || profile?.collegeId || profile?.college_id || 'NA'}</div>
                                </div>
                                <div className="kv">
                                    <div className="kv-label">UID</div>
                                    <div className="kv-value">{user?.uid || profile?.uid || 'NA'}</div>
                                </div>
                                <div className="kv">
                                    <div className="kv-label">Status</div>
                                    <div className="kv-value">{(profile?.isActive === false) ? 'Deactivated' : 'Active'}</div>
                                </div>
                            </div>
                        </div>

                        {(isAdmin || isSuperAdmin) && (
                            <div className="card" style={{ marginTop: '1rem' }}>
                                <div className="card-header">
                                    <h3 className="card-title">Admin</h3>
                                </div>
                                <div className="flex-center gap-2">
                                    {isAdmin && !isSuperAdmin && (
                                        <button type="button" className="btn btn-outline" onClick={() => { setSettingsOpen(false); navigate('/admin/configuration'); }}>
                                            Open Configuration
                                        </button>
                                    )}
                                    {isSuperAdmin && (
                                        <button type="button" className="btn btn-outline" onClick={() => { setSettingsOpen(false); navigate('/superadmin'); }}>
                                            Open SuperAdmin
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline" onClick={() => setSettingsOpen(false)} disabled={profileLoading}>
                                Close
                            </button>
                            <button type="button" className="btn btn-danger" onClick={() => { setSettingsOpen(false); setShowLogoutConfirm(true); }} disabled={profileLoading}>
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Layout;
