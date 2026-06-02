const { auth, rtdb } = require('../firebase/firebase');

const getBearerToken = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice('Bearer '.length).trim();
};

// Verify Firebase Auth ID token
const verifyToken = async (req, res, next) => {
    try {
        const token = getBearerToken(req);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        let decoded;
        try {
            decoded = await auth().verifyIdToken(token);
        } catch (verifyError) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token.'
            });
        }

        const uid = decoded.uid;

        const userSnap = await rtdb().ref(`users/${uid}`).once('value');
        const userProfile = userSnap.val();

        if (!userProfile) {
            return res.status(401).json({
                success: false,
                message: 'User profile not found. This account is not registered in HEXAD yet. Ask an admin to create your account (so a users/{uid} profile exists).'
            });
        }

        if (userProfile.isActive === false) {
            return res.status(403).json({
                success: false,
                message: 'Account is deactivated.'
            });
        }

        // Superadmin is asserted ONLY by presence in /superadmins/{uid}
        const superadminSnap = await rtdb().ref(`superadmins/${uid}`).once('value');
        const isSuperAdmin = superadminSnap.exists();

        // Prevent user profiles from self-assigning super_admin
        let profileRole = userProfile.role || 'user';
        if (!isSuperAdmin && String(profileRole).trim().toLowerCase() === 'super_admin') {
            profileRole = 'user';
        }

        const effectiveRole = isSuperAdmin ? 'super_admin' : profileRole;

        req.user = {
            uid,
            id: uid,
            email: decoded.email || userProfile.email || null,
            role: effectiveRole,
            profileRole,
            isSuperAdmin,
            firstName: userProfile.firstName || userProfile.first_name || null,
            lastName: userProfile.lastName || userProfile.last_name || null,
            collegeId: userProfile.collegeId || userProfile.college_id || null
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error.'
        });
    }
};

// Role-based access control
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required.' 
            });
        }
        
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Insufficient permissions.' 
            });
        }
        
        next();
    };
};

// Convenience middleware for specific roles
const requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required.'
        });
    }

    if (req.user.isSuperAdmin !== true) {
        return res.status(403).json({
            success: false,
            message: 'Access denied. SuperAdmin required.'
        });
    }

    return next();
};

// Strict student-only access (super_admin is NOT allowed)
const requireStudent = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required.'
        });
    }

    if (req.user.role !== 'student') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Student role required.'
        });
    }

    return next();
};
const requireAdmin = requireRole('super_admin', 'admin');
const requireTeacher = requireRole('super_admin', 'admin', 'teacher');
const requireAnyStaff = requireRole('super_admin', 'admin', 'teacher');

module.exports = {
    verifyToken,
    requireRole,
    requireSuperAdmin,
    requireStudent,
    requireAdmin,
    requireTeacher,
    requireAnyStaff
};
