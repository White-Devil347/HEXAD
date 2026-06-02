const { v4: uuidv4 } = require('uuid');
const { rtdb } = require('../firebase/firebase');
const { response } = require('../utils');

const PATHS = {
    config: (collegeId) => `colleges/${collegeId}/config`,
    geofences: (collegeId) => `colleges/${collegeId}/geofences`,
    geofence: (collegeId, geofenceId) => `colleges/${collegeId}/geofences/${geofenceId}`,
    wifiNetworks: (collegeId) => `colleges/${collegeId}/wifi_networks`,
    wifiNetwork: (collegeId, networkId) => `colleges/${collegeId}/wifi_networks/${networkId}`,
    retentionPolicies: (collegeId) => `colleges/${collegeId}/retention_policies`,
    retentionPolicy: (collegeId, dataType) => `colleges/${collegeId}/retention_policies/${dataType}`
};

const readVal = async (path) => {
    const snap = await rtdb().ref(path).once('value');
    return snap.val();
};

exports.getConfig = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);
        const cfg = await readVal(PATHS.config(collegeId)) || {};
        return response.success(res, cfg);
    } catch (error) {
        console.error('Get config error:', error);
        return response.serverError(res, 'Failed to fetch config');
    }
};

exports.updateConfig = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { configs } = req.body;
        const updates = {};
        configs.forEach((c) => {
            updates[`${PATHS.config(collegeId)}/${c.key}`] = c.value;
        });
        await rtdb().ref().update(updates);
        await req.audit('UPDATE_CONFIG', 'config', collegeId, null, { count: configs.length });
        return response.success(res, null, 'Config updated');
    } catch (error) {
        console.error('Update config error:', error);
        return response.serverError(res, 'Failed to update config');
    }
};

// ==================== GEOFENCES ====================

exports.getGeofences = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);
        const geofences = await readVal(PATHS.geofences(collegeId)) || {};
        const list = Object.entries(geofences).map(([id, g]) => ({ id, ...g }));
        return response.success(res, list);
    } catch (error) {
        console.error('Get geofences error:', error);
        return response.serverError(res, 'Failed to fetch geofences');
    }
};

exports.createGeofence = async (req, res) => {
    try {
        const requestedCollegeId = req.body.collegeId;
        if (requestedCollegeId && req.user?.isSuperAdmin !== true) {
            return response.forbidden(res, 'Access denied');
        }

        const collegeId = (requestedCollegeId ? requestedCollegeId : req.user.collegeId);
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { name, latitude, longitude, radiusMeters } = req.body;
        const geofenceId = uuidv4();
        const nowMs = Date.now();

        await rtdb().ref(PATHS.geofence(collegeId, geofenceId)).set({
            name,
            latitude,
            longitude,
            radiusMeters: radiusMeters ?? 100,
            isActive: true,
            created_at_ms: nowMs
        });

        await req.audit('CREATE_GEOFENCE', 'geofence', geofenceId, null, { collegeId, name });
        return response.created(res, { id: geofenceId }, 'Geofence created');
    } catch (error) {
        console.error('Create geofence error:', error);
        return response.serverError(res, 'Failed to create geofence');
    }
};

exports.updateGeofence = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { geofenceId } = req.params;
        const existing = await readVal(PATHS.geofence(collegeId, geofenceId));
        if (!existing) return response.notFound(res, 'Geofence not found');

        const patch = {};
        ['name', 'latitude', 'longitude', 'radiusMeters', 'isActive'].forEach((k) => {
            if (req.body[k] !== undefined) patch[k] = req.body[k];
        });
        if (Object.keys(patch).length === 0) return response.error(res, 'No changes provided', 400);

        await rtdb().ref(PATHS.geofence(collegeId, geofenceId)).update(patch);
        await req.audit('UPDATE_GEOFENCE', 'geofence', geofenceId, existing, patch);
        return response.success(res, null, 'Geofence updated');
    } catch (error) {
        console.error('Update geofence error:', error);
        return response.serverError(res, 'Failed to update geofence');
    }
};

exports.deleteGeofence = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { geofenceId } = req.params;
        await rtdb().ref(PATHS.geofence(collegeId, geofenceId)).remove();
        await req.audit('DELETE_GEOFENCE', 'geofence', geofenceId);
        return response.success(res, null, 'Geofence deleted');
    } catch (error) {
        console.error('Delete geofence error:', error);
        return response.serverError(res, 'Failed to delete geofence');
    }
};

// ==================== WIFI NETWORKS ====================

exports.getWifiNetworks = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);
        const networks = await readVal(PATHS.wifiNetworks(collegeId)) || {};
        const list = Object.entries(networks).map(([id, n]) => ({ id, ...n }));
        return response.success(res, list);
    } catch (error) {
        console.error('Get wifi networks error:', error);
        return response.serverError(res, 'Failed to fetch wifi networks');
    }
};

exports.createWifiNetwork = async (req, res) => {
    try {
        const requestedCollegeId = req.body.collegeId;
        if (requestedCollegeId && req.user?.isSuperAdmin !== true) {
            return response.forbidden(res, 'Access denied');
        }

        const collegeId = (requestedCollegeId ? requestedCollegeId : req.user.collegeId);
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { ssid, description } = req.body;
        const networkId = uuidv4();
        await rtdb().ref(PATHS.wifiNetwork(collegeId, networkId)).set({
            ssid,
            description: description || null,
            created_at_ms: Date.now()
        });

        await req.audit('CREATE_WIFI_NETWORK', 'wifi_network', networkId, null, { collegeId, ssid });
        return response.created(res, { id: networkId }, 'WiFi network created');
    } catch (error) {
        console.error('Create wifi network error:', error);
        return response.serverError(res, 'Failed to create WiFi network');
    }
};

exports.deleteWifiNetwork = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { networkId } = req.params;
        await rtdb().ref(PATHS.wifiNetwork(collegeId, networkId)).remove();
        await req.audit('DELETE_WIFI_NETWORK', 'wifi_network', networkId);
        return response.success(res, null, 'WiFi network deleted');
    } catch (error) {
        console.error('Delete wifi network error:', error);
        return response.serverError(res, 'Failed to delete WiFi network');
    }
};

// ==================== RETENTION POLICIES ====================

exports.getRetentionPolicies = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);
        const policies = await readVal(PATHS.retentionPolicies(collegeId)) || {};
        const list = Object.entries(policies).map(([dataType, p]) => ({ dataType, ...p }));
        return response.success(res, list);
    } catch (error) {
        console.error('Get retention policies error:', error);
        return response.serverError(res, 'Failed to fetch retention policies');
    }
};

exports.updateRetentionPolicy = async (req, res) => {
    try {
        const collegeId = req.user.collegeId;
        if (!collegeId) return response.error(res, 'Missing collegeId', 400);

        const { dataType, retentionDays, autoArchive, autoDelete } = req.body;
        await rtdb().ref(PATHS.retentionPolicy(collegeId, dataType)).set({
            retentionDays,
            autoArchive: Boolean(autoArchive),
            autoDelete: Boolean(autoDelete),
            updated_at_ms: Date.now()
        });

        await req.audit('UPDATE_RETENTION_POLICY', 'retention_policy', dataType, null, { retentionDays, autoArchive, autoDelete });
        return response.success(res, null, 'Retention policy updated');
    } catch (error) {
        console.error('Update retention policy error:', error);
        return response.serverError(res, 'Failed to update retention policy');
    }
};
