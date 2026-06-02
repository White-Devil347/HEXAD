import { useState, useCallback, useEffect } from 'react';
import { api } from '../utils/api';

export function useSchema() {
  const [schema, setSchema] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch schema from backend
  const fetchSchema = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get('/schema/attendance');

      setSchema(response.data.schema);
      setStatus(response.data.status);

      return {
        schema: response.data.schema,
        status: response.data.status,
      };
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      console.error('Schema fetch error:', errorMsg);

      // Still try to get status even if fetch failed
      try {
        const statusResponse = await api.get('/schema/status');
        setStatus(statusResponse.data);
      } catch (statusErr) {
        console.error('Status fetch error:', statusErr.message);
      }

      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh schema from external API
  const refreshSchema = useCallback(async (endpoint) => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.post('/schema/attendance/fetch', {
        endpoint,
      });

      setSchema(response.data.schema);
      setStatus(response.data.status);

      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      console.error('Schema refresh error:', errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear schema cache
  const clearCache = useCallback(async () => {
    try {
      setError(null);
      await api.delete('/schema/cache/clear');
      setSchema(null);
      setStatus(null);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      throw err;
    }
  }, []);

  // Validate a payload against schema
  const validatePayload = useCallback(
    async (payload) => {
      if (!schema) {
        return { valid: false, errors: ['Schema not loaded'] };
      }

      try {
        const response = await api.post('/schema/attendance/validate', {
          payload,
        });

        return response.data;
      } catch (err) {
        console.error('Validation error:', err.message);
        return {
          valid: false,
          errors: [err.response?.data?.error || err.message],
        };
      }
    },
    [schema]
  );

  // Fetch schema on component mount
  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  return {
    schema,
    status,
    loading,
    error,
    isLoaded: !!schema,
    isValid: schema !== null,
    fetchSchema,
    refreshSchema,
    clearCache,
    validatePayload,
    fieldCount: schema ? Object.keys(schema.fields).length : 0,
  };
}
