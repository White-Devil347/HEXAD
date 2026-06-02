import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { Settings, MapPin, Wifi, Clock, Plus, Edit, Trash2, Save } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const Configuration = () => {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState('system');
    const [systemConfig, setSystemConfig] = useState({});
    const [geofences, setGeofences] = useState([]);
    const [wifiNetworks, setWifiNetworks] = useState([]);
    const [retentionPolicies, setRetentionPolicies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('');
    const [editingItem, setEditingItem] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [configRes, geoRes, wifiRes, retentionRes] = await Promise.all([
                adminAPI.getConfig(),
                adminAPI.getGeofences(),
                adminAPI.getWifiNetworks(),
                adminAPI.getRetentionPolicies()
            ]);
            setSystemConfig(configRes.data.data || {});
            setGeofences(geoRes.data.data);
            setWifiNetworks(wifiRes.data.data);
            setRetentionPolicies(retentionRes.data.data);
        } catch (error) {
            console.error('Failed to fetch configuration:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteGeofence = async (id) => {
        if (!window.confirm('Are you sure you want to delete this geofence?')) return;
        try {
            await adminAPI.deleteGeofence(id);
            toast.success('Geofence deleted');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete geofence');
        }
    };

    const handleDeleteWifi = async (id) => {
        if (!window.confirm('Are you sure you want to delete this WiFi network?')) return;
        try {
            await adminAPI.deleteWifiNetwork(id);
            toast.success('WiFi network deleted');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete WiFi network');
        }
    };

    const openModal = (type, item = null) => {
        setModalType(type);
        setEditingItem(item);
        setShowModal(true);
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
                <h1 className="page-title">System Configuration</h1>
            </div>

            {/* Tabs */}
            <div className="tabs mb-4">
                <button
                    className={`tab ${activeTab === 'system' ? 'active' : ''}`}
                    onClick={() => setActiveTab('system')}
                >
                    <Settings size={16} /> System Settings
                </button>
                <button
                    className={`tab ${activeTab === 'geofence' ? 'active' : ''}`}
                    onClick={() => setActiveTab('geofence')}
                >
                    <MapPin size={16} /> Geofences
                </button>
                <button
                    className={`tab ${activeTab === 'wifi' ? 'active' : ''}`}
                    onClick={() => setActiveTab('wifi')}
                >
                    <Wifi size={16} /> WiFi Networks
                </button>
                <button
                    className={`tab ${activeTab === 'retention' ? 'active' : ''}`}
                    onClick={() => setActiveTab('retention')}
                >
                    <Clock size={16} /> Retention Policies
                </button>
            </div>

            {/* System Settings Tab */}
            {activeTab === 'system' && (
                <SystemConfigTab config={systemConfig} onRefresh={fetchData} />
            )}

            {/* Geofences Tab */}
            {activeTab === 'geofence' && (
                <div className="card">
                    <div className="card-header flex-between">
                        <h3 className="card-title">Geofence Locations</h3>
                        <button className="btn btn-primary" onClick={() => openModal('geofence')}>
                            <Plus size={16} /> Add Geofence
                        </button>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Latitude</th>
                                    <th>Longitude</th>
                                    <th>Radius (m)</th>
                                    <th>Description</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {geofences.length > 0 ? (
                                    geofences.map((geo) => (
                                        <tr key={geo.id}>
                                            <td>{geo.name}</td>
                                            <td>{geo.latitude}</td>
                                            <td>{geo.longitude}</td>
                                            <td>{geo.radiusMeters ?? '-'}</td>
                                            <td>-</td>
                                            <td>
                                                <span className={`badge ${geo.isActive !== false ? 'badge-success' : 'badge-danger'}`}>
                                                    {geo.isActive !== false ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex-center gap-1">
                                                    <button
                                                        className="btn btn-sm btn-outline"
                                                        onClick={() => openModal('geofence', geo)}
                                                    >
                                                        <Edit size={14} />
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => handleDeleteGeofence(geo.id)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="7" className="text-center">No geofences configured</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* WiFi Networks Tab */}
            {activeTab === 'wifi' && (
                <div className="card">
                    <div className="card-header flex-between">
                        <h3 className="card-title">Allowed WiFi Networks</h3>
                        <button className="btn btn-primary" onClick={() => openModal('wifi')}>
                            <Plus size={16} /> Add WiFi Network
                        </button>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>SSID</th>
                                    <th>Description</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {wifiNetworks.length > 0 ? (
                                    wifiNetworks.map((wifi) => (
                                        <tr key={wifi.id}>
                                            <td>{wifi.ssid}</td>
                                            <td>{wifi.description || '-'}</td>
                                            <td>
                                                <div className="flex-center gap-1">
                                                    <button
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => handleDeleteWifi(wifi.id)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="3" className="text-center">No WiFi networks configured</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Retention Policies Tab */}
            {activeTab === 'retention' && (
                <div className="card">
                    <div className="card-header flex-between">
                        <h3 className="card-title">Data Retention Policies</h3>
                        <button className="btn btn-primary" onClick={() => openModal('retention')}>
                            <Plus size={16} /> Add Policy
                        </button>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Data Type</th>
                                    <th>Retention Days</th>
                                    <th>Auto Archive</th>
                                    <th>Auto Delete</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {retentionPolicies.length > 0 ? (
                                    retentionPolicies.map((policy) => (
                                        <tr key={policy.dataType}>
                                            <td>{policy.dataType}</td>
                                            <td>{policy.retentionDays} days</td>
                                            <td>
                                                <span className={`badge ${policy.autoArchive ? 'badge-success' : 'badge-warning'}`}>
                                                    {policy.autoArchive ? 'Yes' : 'No'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge ${policy.autoDelete ? 'badge-success' : 'badge-warning'}`}>
                                                    {policy.autoDelete ? 'Yes' : 'No'}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    className="btn btn-sm btn-outline"
                                                    onClick={() => openModal('retention', policy)}
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="text-center">No retention policies configured</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="alert alert-info mt-4">
                        <strong>Note:</strong> Retention policies control how long data is kept before automatic cleanup.
                        Archived data can be restored if needed.
                    </div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <ConfigModal
                    type={modalType}
                    item={editingItem}
                    onClose={() => { setShowModal(false); setEditingItem(null); }}
                    onSuccess={() => {
                        setShowModal(false);
                        setEditingItem(null);
                        fetchData();
                    }}
                />
            )}
        </div>
    );
};

// System Config Tab Component
const SystemConfigTab = ({ config, onRefresh }) => {
    const toast = useToast();
    const [editedConfig, setEditedConfig] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setEditedConfig({ ...(config || {}) });
    }, [config]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const configs = Object.entries(editedConfig).map(([key, value]) => ({ key, value }));
            await adminAPI.updateConfig({ configs });
            toast.success('Configuration saved');
            onRefresh();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    const configGroups = {
        'Attendance Settings': ['default_session_duration', 'late_threshold_minutes', 'max_session_duration'],
        'Location Settings': ['default_geofence_radius', 'location_accuracy_threshold'],
        'Photo Settings': ['photo_encryption_enabled', 'photo_retention_days'],
        'System Settings': ['system_timezone', 'maintenance_mode']
    };

    return (
        <div className="card">
            <div className="card-header flex-between">
                <h3 className="card-title">System Settings</h3>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
            
            {Object.entries(configGroups).map(([groupName, keys]) => (
                <div key={groupName} className="config-group mb-4">
                    <h4 className="config-group-title">{groupName}</h4>
                    <div className="grid grid-2 gap-4">
                        {keys.map(key => {
                            const rawVal = editedConfig[key];
                            const isBoolLike = rawVal === true || rawVal === false || rawVal === 'true' || rawVal === 'false';
                            return (
                                <div key={key} className="form-group">
                                    <label className="form-label">
                                        {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                    </label>
                                    {isBoolLike ? (
                                        <select
                                            className="form-input"
                                            value={String(rawVal === true || rawVal === false ? rawVal : rawVal || 'false')}
                                            onChange={(e) => setEditedConfig({ ...editedConfig, [key]: e.target.value })}
                                        >
                                            <option value="true">Enabled</option>
                                            <option value="false">Disabled</option>
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={editedConfig[key] || ''}
                                            onChange={(e) => setEditedConfig({ ...editedConfig, [key]: e.target.value })}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

// Config Modal Component
const ConfigModal = ({ type, item, onClose, onSuccess }) => {
    const toast = useToast();
    const [formData, setFormData] = useState({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (type === 'geofence') {
            setFormData({
                name: item?.name || '',
                latitude: item?.latitude || '',
                longitude: item?.longitude || '',
                radiusMeters: item?.radiusMeters || 100,
                isActive: item?.isActive !== false
            });
        } else if (type === 'wifi') {
            setFormData({
                ssid: item?.ssid || '',
                description: item?.description || ''
            });
        } else if (type === 'retention') {
            setFormData({
                dataType: item?.dataType || '',
                retentionDays: item?.retentionDays || 365,
                autoArchive: item?.autoArchive === true,
                autoDelete: item?.autoDelete === true
            });
        }
    }, [type, item]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (type === 'geofence') {
                if (item) {
                    await adminAPI.updateGeofence(item.id, formData);
                } else {
                    await adminAPI.createGeofence(formData);
                }
            } else if (type === 'wifi') {
                await adminAPI.createWifiNetwork(formData);
            } else if (type === 'retention') {
                await adminAPI.updateRetentionPolicy(formData);
            }
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || `Failed to save ${type}`);
        } finally {
            setSubmitting(false);
        }
    };

    const getTitle = () => {
        const action = item ? 'Edit' : 'Add';
        const typeLabel = type === 'geofence' ? 'Geofence' : type === 'wifi' ? 'WiFi Network' : 'Retention Policy';
        return `${action} ${typeLabel}`;
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h3 className="modal-title">{getTitle()}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    {type === 'geofence' && (
                        <>
                            <div className="form-group">
                                <label className="form-label">Name *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    placeholder="e.g., Main Building"
                                />
                            </div>
                            <div className="grid grid-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">Latitude *</label>
                                    <input
                                        type="number"
                                        step="any"
                                        className="form-input"
                                        value={formData.latitude}
                                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                                        required
                                        placeholder="e.g., 12.9716"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Longitude *</label>
                                    <input
                                        type="number"
                                        step="any"
                                        className="form-input"
                                        value={formData.longitude}
                                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                                        required
                                        placeholder="e.g., 77.5946"
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Radius (meters)</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.radiusMeters}
                                    onChange={(e) => setFormData({ ...formData, radiusMeters: parseInt(e.target.value) })}
                                    min={50}
                                    max={1000}
                                />
                            </div>
                        </>
                    )}

                    {type === 'wifi' && (
                        <>
                            <div className="form-group">
                                <label className="form-label">SSID (Network Name) *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.ssid}
                                    onChange={(e) => setFormData({ ...formData, ssid: e.target.value })}
                                    required
                                    placeholder="e.g., Campus-WiFi"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="e.g., Campus WiFi"
                                />
                            </div>
                        </>
                    )}

                    {type === 'retention' && (
                        <>
                            <div className="form-group">
                                <label className="form-label">Data Type *</label>
                                <select
                                    className="form-input"
                                    value={formData.dataType}
                                    onChange={(e) => setFormData({ ...formData, dataType: e.target.value })}
                                    required
                                    disabled={Boolean(item)}
                                >
                                    <option value="">Select Data Type</option>
                                    <option value="attendance_sessions">Attendance Sessions</option>
                                    <option value="attendance_records">Attendance Records</option>
                                    <option value="attendance_photos">Attendance Photos</option>
                                    <option value="audit_logs">Audit Logs</option>
                                    <option value="sync_logs">Sync Logs</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Retention Days *</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.retentionDays}
                                    onChange={(e) => setFormData({ ...formData, retentionDays: parseInt(e.target.value) })}
                                    min={30}
                                    max={3650}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="flex-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={formData.autoArchive}
                                        onChange={(e) => setFormData({ ...formData, autoArchive: e.target.checked })}
                                    />
                                    Auto archive
                                </label>
                            </div>
                            <div className="form-group">
                                <label className="flex-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={formData.autoDelete}
                                        onChange={(e) => setFormData({ ...formData, autoDelete: e.target.checked })}
                                    />
                                    Auto delete
                                </label>
                            </div>
                        </>
                    )}

                    {type === 'geofence' && (
                        <div className="form-group">
                            <label className="flex-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={formData.isActive}
                                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                />
                                Active
                            </label>
                        </div>
                    )}

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Saving...' : item ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Configuration;
