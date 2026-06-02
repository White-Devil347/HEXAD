import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { firebaseAuth } from '../services/firebase';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const normalizeRole = useCallback((role) => {
        if (role === null || role === undefined) return '';
        return String(role).trim().toLowerCase();
    }, []);

    const normalizeUser = useCallback((rawUser) => {
        if (!rawUser) return null;

        return {
            ...rawUser,
            role: normalizeRole(rawUser.role),
            isSuperAdmin: rawUser.isSuperAdmin === true,
            firstName: rawUser.firstName ?? rawUser.first_name,
            lastName: rawUser.lastName ?? rawUser.last_name,
            collegeId: rawUser.collegeId ?? rawUser.college_id,
            phone: rawUser.phone ?? rawUser.phone_number,
            email: rawUser.email ?? rawUser.mail
        };
    }, [normalizeRole]);

    const fetchUserContext = useCallback(async () => {
        const [meRes, profileRes] = await Promise.allSettled([
            authAPI.getMe(),
            authAPI.getProfile()
        ]);

        const me = meRes.status === 'fulfilled' ? (meRes.value?.data || null) : null;
        const profile = profileRes.status === 'fulfilled' ? (profileRes.value?.data?.data || null) : null;

        // /auth/me is not wrapped; /auth/profile is wrapped as { success, data }.
        // Prefer role/isSuperAdmin from /auth/me, and names/email from /auth/profile.
        return {
            ...(profile && typeof profile === 'object' ? profile : null),
            ...(me && typeof me === 'object' ? me : null)
        };
    }, []);

    const getDashboardPathForUser = (u) => {
        if (!u) return '/login';
        if (u.isSuperAdmin === true) return '/superadmin';

        const normalizedRole = normalizeRole(u.role);
        if (normalizedRole === 'admin') return '/admin/dashboard';
        if (normalizedRole === 'teacher') return '/teacher/dashboard';
        if (normalizedRole === 'student') return '/student';
        return '/login';
    };

    const getDashboardPathForRole = (role) => getDashboardPathForUser({ role, isSuperAdmin: false });

    useEffect(() => {
        const unsub = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
            try {
                if (!firebaseUser) {
                    localStorage.removeItem('idToken');
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('refreshToken');
                    setUser(null);
                    setLoading(false);
                    return;
                }

                const idToken = await firebaseUser.getIdToken();
                localStorage.setItem('idToken', idToken);
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');

                const ctx = await fetchUserContext();
                setUser(normalizeUser(ctx));
            } catch (error) {
                localStorage.removeItem('idToken');
                setUser(null);
            } finally {
                setLoading(false);
            }
        });

        return () => unsub();
    }, [fetchUserContext, normalizeUser]);

    const login = async (email, password) => {
        try {
            const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
            const idToken = await cred.user.getIdToken();

            localStorage.setItem('idToken', idToken);
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');

            try {
                const ctx = await fetchUserContext();
                const normalized = normalizeUser(ctx);
                setUser(normalized);
                return normalized;
            } catch (apiError) {
                // Firebase login succeeded, but the API rejected the user (most commonly missing RTDB profile).
                await signOut(firebaseAuth);
                localStorage.removeItem('idToken');
                setUser(null);
                throw apiError;
            }
        } catch (err) {
            // If it's a Firebase auth error, surface a friendly message.
            const code = err?.code;
            if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
                throw new Error('Invalid email or password.');
            }
            if (code === 'auth/user-not-found') {
                throw new Error('No account found for this email.');
            }
            if (code === 'auth/too-many-requests') {
                throw new Error('Too many attempts. Please wait and try again.');
            }
            if (code === 'auth/network-request-failed') {
                throw new Error('Network error. Check your connection and try again.');
            }
            throw err;
        }
    };

    const logout = async () => {
        try {
            // Best-effort: record logout for security analytics before we clear tokens.
            try {
                await authAPI.logout({ clientTimestampMs: Date.now() });
            } catch (e) {
                // Ignore failures (logout should always complete).
            }
            await signOut(firebaseAuth);
        } finally {
            localStorage.removeItem('idToken');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            setUser(null);
        }
    };

    const value = {
        user,
        loading,
        login,
        logout,
        getDashboardPathForRole,
        getDashboardPathForUser,
        isAuthenticated: !!user,
        isTeacher: user?.role === 'teacher',
        isAdmin: user?.role === 'admin' || user?.isSuperAdmin === true,
        isSuperAdmin: user?.isSuperAdmin === true
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
