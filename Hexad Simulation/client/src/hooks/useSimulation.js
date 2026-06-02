import { useState, useCallback, useEffect } from 'react';
import { api } from '../utils/api';

export function useSimulation() {
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const executeSimulation = useCallback(async (simulationParams) => {
    try {
      setLoading(true);
      setError(null);
      setJob(null);

      const response = await api.post('/simulation/execute', simulationParams);
      const newJobId = response.data.jobId;
      setJobId(newJobId);
      setJob({ status: 'queued', logs: [], total: 0, completed: 0, succeeded: 0, failed: 0, retried: 0 });

      return newJobId;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const pollStatus = useCallback(async (id) => {
    if (!id) return;

    try {
      const response = await api.get(`/simulation/status/${id}`);
      setJob(response.data);
      return response.data;
    } catch (err) {
      console.error('Polling error:', err.message);
    }
  }, []);

  const fetchLogs = useCallback(async (sessionId, limit = 100) => {
    try {
      setError(null);
      const response = await api.get('/simulation/logs', {
        params: { sessionId, limit },
      });
      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      throw err;
    }
  }, []);

  // Auto-poll when job is running
  useEffect(() => {
    if (!jobId || job?.status === 'completed' || job?.status === 'error') return;

    const interval = setInterval(() => {
      pollStatus(jobId);
    }, 500); // Poll every 500ms

    return () => clearInterval(interval);
  }, [jobId, job?.status, pollStatus]);

  return {
    jobId,
    job,
    status: job?.status || null,
    loading,
    error,
    logs: job?.logs || [],
    completed: job?.completed ?? 0,
    total: job?.total ?? 0,
    succeeded: job?.succeeded ?? 0,
    failed: job?.failed ?? 0,
    retried: job?.retried ?? 0,
    executeSimulation,
    pollStatus,
    fetchLogs,
    reset: () => {
      setJobId(null);
      setJob(null);
      setError(null);
    },
  };
}
