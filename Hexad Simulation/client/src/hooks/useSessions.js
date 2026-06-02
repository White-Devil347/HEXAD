import { useState, useCallback } from 'react';
import { api } from '../utils/api';

export function useSessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/sessions');
      const data = response.data;

      if (!data || data.success !== true || !Array.isArray(data.data)) {
        throw new Error('Invalid sessions response from backend');
      }

      setSessions(data.data);
      return data;
    } catch (err) {
      const status = err.response?.status;

      if (status === 429) {
        const retryAfterHeader = err.response?.headers?.['retry-after'];
        const retryAfterSeconds = Number(retryAfterHeader);
        const retryAfterText = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? ` Please retry in ~${retryAfterSeconds}s.`
          : ' Please wait a bit and try again.';
        setError(`Rate limited (429).${retryAfterText}`);
      } else {
        const errorMsg = err.response?.data?.error || err.message;
        setError(errorMsg);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    sessions,
    loading,
    error,
    fetchSessions,
  };
}
