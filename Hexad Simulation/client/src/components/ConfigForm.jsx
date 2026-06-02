import React, { useState, useEffect } from 'react';
import { Card } from './common/Card';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { api } from '../utils/api';
const LOCAL_STORAGE_KEY = 'hexadSimulatorApiConfig';

export const ConfigForm = () => {
  const [config, setConfig] = useState({
    baseURL: '',
    sessionsEndpoint: '/public/sessions',
    attendanceEndpoint: '/student/submit-attendance',
    enrollmentEndpointTemplate: '/teacher/sessions/{sessionId}/enrolled-students',
    collegeId: 'college_001',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          setConfig((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {
      // ignore localStorage/JSON errors
    }

    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await api.get('/config');
      setConfig(response.data);
      setIsEditing(Boolean(response.data?.needsSetup) || !response.data?.baseURL);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(response.data));
      } catch {
        // ignore
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  };

  const handleSave = async () => {
    if (!isEditing) return;
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);

      const response = await api.post('/config', config);
      const savedConfig = response.data?.config || config;
      setConfig(savedConfig);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedConfig));
      } catch {
        // ignore
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setIsEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-lg font-semibold gradient-text">⚙️ API Configuration</h3>
        <div className="ml-auto">
          {!isEditing && (
            <Button
              variant="secondary"
              onClick={() => setIsEditing(true)}
              className="!px-4"
            >
              Edit
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Configure the external Hexad API endpoints for session fetching and attendance submission.
      </p>

      {error && (
        <div className="p-3 bg-error bg-opacity-10 border border-error rounded-lg text-error text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-success bg-opacity-10 border border-success rounded-lg text-success text-sm">
          ✓ Configuration saved successfully
        </div>
      )}

      <div className="space-y-4">
        <Input
          label="API Base URL"
          value={config.baseURL}
          onChange={(e) => setConfig({ ...config, baseURL: e.target.value })}
          placeholder="(set on server via HEXAD_API_BASE_URL)"
          containerClassName="w-full"
          disabled={!isEditing}
        />

        <Input
          label="Sessions Endpoint"
          value={config.sessionsEndpoint}
          onChange={(e) => setConfig({ ...config, sessionsEndpoint: e.target.value })}
          placeholder="/public/sessions"
          containerClassName="w-full"
          disabled={!isEditing}
        />

        <Input
          label="Attendance Endpoint (Trusted Mode)"
          value={config.attendanceEndpoint}
          onChange={(e) => setConfig({ ...config, attendanceEndpoint: e.target.value })}
          placeholder="/student/submit-attendance"
          containerClassName="w-full"
          disabled={!isEditing}
        />

        <Input
          label="Enrollment Sync Endpoint"
          value={config.enrollmentEndpointTemplate || ''}
          onChange={(e) => setConfig({ ...config, enrollmentEndpointTemplate: e.target.value })}
          placeholder="/teacher/sessions/{sessionId}/enrolled-students"
          containerClassName="w-full"
          disabled={!isEditing}
        />

        <Input
          label="College ID"
          value={config.collegeId}
          onChange={(e) => setConfig({ ...config, collegeId: e.target.value })}
          placeholder="college_001"
          containerClassName="w-full"
          disabled={!isEditing}
        />
      </div>

      {isEditing ? (
        <Button
          variant="primary"
          onClick={handleSave}
          loading={loading}
          className="w-full"
        >
          Apply Changes
        </Button>
      ) : (
        <p className="text-xs text-slate-500 text-center">
          Configuration locked. Click <span className="text-slate-300 font-medium">Edit</span> to make changes.
        </p>
      )}

      <p className="text-xs text-slate-500 text-center">
        Full URL will be: <code className="text-primary">{config.baseURL}{config.sessionsEndpoint}</code>
      </p>
      <p className="text-xs text-slate-500 text-center">
        Enrollment URL template: <code className="text-primary">{config.baseURL}{config.enrollmentEndpointTemplate || '/teacher/sessions/{sessionId}/enrolled-students'}</code>
      </p>
    </Card>
  );
};
