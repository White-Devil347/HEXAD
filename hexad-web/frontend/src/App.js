import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ToastHost from './components/ToastHost';
import Layout from './components/Layout';

const LoadingScreen = () => (
    <div className="loading">
        <div className="spinner"></div>
    </div>
);

const Login = React.lazy(() => import('./pages/Login'));

// Teacher Pages
const TeacherDashboard = React.lazy(() => import('./pages/teacher/Dashboard'));
const AssignedClasses = React.lazy(() => import('./pages/teacher/AssignedClasses'));
const Sessions = React.lazy(() => import('./pages/teacher/Sessions'));
const SessionDetailPage = React.lazy(() => import('./pages/teacher/SessionDetailPage'));
const Analytics = React.lazy(() => import('./pages/teacher/Analytics'));
const Reports = React.lazy(() => import('./pages/teacher/Reports'));
const TeacherInsights = React.lazy(() => import('./pages/teacher/Insights'));

// Admin Pages
const AdminDashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const Users = React.lazy(() => import('./pages/admin/Users'));
const Institution = React.lazy(() => import('./pages/admin/Institution'));
const Configuration = React.lazy(() => import('./pages/admin/Configuration'));
const Monitoring = React.lazy(() => import('./pages/admin/Monitoring'));

// SuperAdmin Pages
const SuperAdminDashboard = React.lazy(() => import('./pages/superadmin/SuperAdminDashboard'));

// Student Pages (minimal placeholder)
const StudentDashboard = React.lazy(() => import('./pages/student/Dashboard'));

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles = [] }) => {
    const { user, loading, getDashboardPathForUser } = useAuth();

    if (loading) {
        return <LoadingScreen />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles.length > 0) {
        const isAllowed = allowedRoles.includes(user.role) || (allowedRoles.includes('super_admin') && user.isSuperAdmin === true);
        if (!isAllowed) {
            return <Navigate to={getDashboardPathForUser(user)} replace />;
        }
    }

    return children;
};

// Public Route (redirect if logged in)
const PublicRoute = ({ children }) => {
    const { user, loading, getDashboardPathForUser } = useAuth();

    if (loading) {
        return <LoadingScreen />;
    }

    if (user) {
        return <Navigate to={getDashboardPathForUser(user)} replace />;
    }

    return children;
};

// Role-based redirect component
const RoleBasedRedirect = () => {
    const { user, loading, getDashboardPathForUser } = useAuth();

    if (loading) {
        return <LoadingScreen />;
    }

    return <Navigate to={getDashboardPathForUser(user)} replace />;
};

function App() {
    return (
        <ToastProvider>
            <AuthProvider>
                <BrowserRouter>
                    <ToastHost />
                    <Routes>
                    {/* Public Routes */}
                    <Route
                        path="/login"
                        element={
                            <PublicRoute>
                                <Suspense fallback={<LoadingScreen />}>
                                    <Login />
                                </Suspense>
                            </PublicRoute>
                        }
                    />

                    {/* Root redirect */}
                    <Route path="/" element={<RoleBasedRedirect />} />

                    {/* Teacher Routes */}
                    <Route
                        path="/teacher"
                        element={
                            <ProtectedRoute allowedRoles={['teacher']}>
                                <Layout />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<Navigate to="dashboard" replace />} />
                        <Route path="dashboard" element={<TeacherDashboard />} />
                        <Route path="sessions" element={<Sessions />} />
                        <Route path="sessions/:sessionId/details" element={<SessionDetailPage />} />
                        <Route path="assigned-classes" element={<AssignedClasses />} />
                        <Route path="analytics" element={<Analytics />} />
                        <Route path="insights" element={<TeacherInsights />} />
                        <Route path="reports" element={<Reports />} />
                    </Route>

                    {/* Admin Routes */}
                    <Route
                        path="/admin"
                        element={
                            <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                                <Layout />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<Navigate to="dashboard" replace />} />
                        <Route path="dashboard" element={<AdminDashboard />} />
                        <Route path="users" element={<Users />} />
                        <Route path="institution" element={<Institution />} />
                        <Route path="configuration" element={<Configuration />} />
                        <Route path="monitoring" element={<Monitoring />} />
                    </Route>

                    {/* SuperAdmin Routes */}
                    <Route
                        path="/superadmin"
                        element={
                            <ProtectedRoute allowedRoles={['super_admin']}>
                                <Layout />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<SuperAdminDashboard />} />
                    </Route>

                    {/* Student Routes (minimal placeholder) */}
                    <Route
                        path="/student"
                        element={
                            <ProtectedRoute allowedRoles={['student']}>
                                <Layout />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<StudentDashboard />} />
                    </Route>

                    {/* 404 - Redirect to role-based dashboard */}
                    <Route path="*" element={<RoleBasedRedirect />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </ToastProvider>
    );
}

export default App;
