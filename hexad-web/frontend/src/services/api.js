import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const DEFAULT_CACHE_TTL_MS = 15_000;
const getCacheKey = (url, config) => {
    const token = localStorage.getItem('idToken') || localStorage.getItem('accessToken') || '';
    const params = config?.params ? JSON.stringify(config.params) : '';
    return `${token}::${url}::${params}`;
};

const getCache = new Map();
const invalidateGetCache = () => {
    getCache.clear();
};

// Create axios instance
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

const cachedGet = (url, config, ttlMs = DEFAULT_CACHE_TTL_MS) => {
    const now = Date.now();
    const key = getCacheKey(url, config);
    const cached = getCache.get(key);
    if (cached && cached.expiresAtMs > now) {
        return cached.promise;
    }

    const promise = api.get(url, config)
        .catch((err) => {
            // Don't keep failed requests in cache
            getCache.delete(key);
            throw err;
        });

    getCache.set(key, { expiresAtMs: now + ttlMs, promise });
    return promise;
};

// Request interceptor - add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('idToken') || localStorage.getItem('accessToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor - clear auth on 401
api.interceptors.response.use(
    (response) => {
        const method = String(response?.config?.method || 'get').toLowerCase();
        if (method !== 'get') {
            invalidateGetCache();
        }
        return response;
    },
    async (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('idToken');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            invalidateGetCache();
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authAPI = {
    getMe: () => api.get('/auth/me'),
    getProfile: () => api.get('/auth/profile'),
    logout: (data) => api.post('/auth/logout', data)
};

// SuperAdmin API
export const superadminAPI = {
    getColleges: () => api.get('/superadmin/colleges'),
    createCollege: (data) => api.post('/superadmin/colleges', data),
    createAdmin: (data) => api.post('/superadmin/admins', data),
    setCollegeStatus: (collegeId, isActive) => api.patch(`/superadmin/colleges/${collegeId}/status`, { isActive })
};

// Teacher API
export const teacherAPI = {
    // Assignments
    getAssignments: () => cachedGet('/teacher/assignments'),
    
    // Sessions
    getSessions: (params) => api.get('/teacher/sessions', { params }),
    getSession: (sessionId, params) => api.get(`/teacher/sessions/${sessionId}`, params ? { params } : undefined),
    createSession: (data) => api.post('/teacher/sessions', data),
    regenerateCode: (sessionId) => api.post(`/teacher/sessions/${sessionId}/regenerate-code`),
    startSession: (sessionId) => api.post(`/teacher/sessions/${sessionId}/start`),
    endSession: (sessionId) => api.post(`/teacher/sessions/${sessionId}/end`),
    overrideAttendance: (sessionId, data) => api.post(`/teacher/sessions/${sessionId}/override`, data),
    getAttempts: (sessionId, studentId) => api.get(`/teacher/sessions/${sessionId}/attempts/${studentId}`),
    getFlaggedStudents: (sessionId) => api.get(`/teacher/sessions/${sessionId}/flagged`),
    
    // Analytics
    getAnalytics: (params) => api.get('/teacher/analytics', { params }),
    getStudentAnalytics: (params) => api.get('/teacher/analytics/students', { params }),
    getInsights: (params) => api.get('/teacher/insights', { params }),
    getHeatmap: (params) => api.get('/teacher/analytics/heatmap', { params }),
    
    // Reports
    exportExcel: (params) => api.get('/teacher/reports/export/excel', { params, responseType: 'blob' }),
    exportPDF: (params) => api.get('/teacher/reports/export/pdf', { params, responseType: 'blob' }),
    getMonthlyReport: (params) => api.get('/teacher/reports/monthly', { params }),
    generateMonthlyReport: (params) => api.get('/teacher/reports/monthly', { params })
};

// Admin API
export const adminAPI = {
    // Dashboard
    getDashboard: () => cachedGet('/admin/dashboard'),
    
    // Colleges
    getColleges: (params) => api.get('/admin/colleges', { params }),
    createCollege: (data) => api.post('/admin/colleges', data),
    updateCollege: (collegeId, data) => api.put(`/admin/colleges/${collegeId}`, data),
    
    // Departments
    getDepartments: (params) => cachedGet('/admin/departments', { params }),
    createDepartment: (data) => api.post('/admin/departments', data),
    updateDepartment: (departmentId, data) => api.put(`/admin/departments/${departmentId}`, data),
    
    // Classes
    getClasses: (params) => cachedGet('/admin/classes', { params }),
    createClass: (data) => api.post('/admin/classes', data),
    updateClass: (classId, data) => api.put(`/admin/classes/${classId}`, data),
    
    // Subjects
    getSubjects: (params) => cachedGet('/admin/subjects', { params }),
    createSubject: (data) => api.post('/admin/subjects', data),
    assignSubjectToClass: (data) => api.post('/admin/subjects/assign-class', data),
    
    // Users
    getUsers: (params) => api.get('/admin/users', { params }),
    getUserById: (userId) => api.get(`/admin/users/${userId}`),
    getUsersBulk: (uids) => api.post('/admin/users/bulk', Array.isArray(uids) ? uids : []),
    createTeacher: (data) => api.post('/admin/users/teachers', data),
    createStudent: (data) => api.post('/admin/users/students', data),
    bulkImportTeachers: (data) => api.post('/admin/users/teachers/bulk', data),
    bulkImportStudents: (data) => api.post('/admin/users/students/bulk', data),
    importUsers: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post('/admin/import-users', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
    },
    updateUser: (userId, data) => api.put(`/admin/users/${userId}`, data),
    resetPassword: (userId, newPassword) => api.post(`/admin/users/${userId}/reset-password`, { newPassword }),
    
    // Teacher Assignments
    getTeacherAssignments: (teacherId) => api.get(`/admin/teachers/${teacherId}/assignments`),
    assignTeacher: (data) => api.post('/admin/teachers/assignments', data),
    removeAssignment: (assignmentId) => api.delete(`/admin/teachers/assignments/${assignmentId}`),
    
    // Configuration
    getConfig: () => cachedGet('/admin/config'),
    updateConfig: (data) => api.put('/admin/config', data),
    
    // Geofences
    getGeofences: () => api.get('/admin/geofences'),
    createGeofence: (data) => api.post('/admin/geofences', data),
    updateGeofence: (geofenceId, data) => api.put(`/admin/geofences/${geofenceId}`, data),
    deleteGeofence: (geofenceId) => api.delete(`/admin/geofences/${geofenceId}`),
    
    // WiFi Networks
    getWifiNetworks: () => api.get('/admin/wifi-networks'),
    createWifiNetwork: (data) => api.post('/admin/wifi-networks', data),
    deleteWifiNetwork: (networkId) => api.delete(`/admin/wifi-networks/${networkId}`),
    
    // Retention Policies
    getRetentionPolicies: () => api.get('/admin/retention-policies'),
    updateRetentionPolicy: (data) => api.put('/admin/retention-policies', data),
    
    // Monitoring
    getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
    getSyncLogs: (params) => api.get('/admin/sync-logs', { params }),
    getSuspiciousActivities: (params) => api.get('/admin/suspicious-activities', { params }),
    resolveActivity: (activityId, data) => api.post(`/admin/suspicious-activities/${activityId}/resolve`, data),
    getStorageHealth: () => cachedGet('/admin/storage-health', undefined, 10_000)
};

export default api;
