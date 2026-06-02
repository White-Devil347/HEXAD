import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';

const StudentsContext = createContext(null);

function downloadFromResponse(response, fallbackFilename) {
  const contentDisposition = response.headers?.['content-disposition'] || '';
  const filenameMatch = contentDisposition.match(/filename\*=UTF-8''([^;\n]+)|filename="?([^";\n]+)"?/i);
  const filename = decodeURIComponent(filenameMatch?.[1] || filenameMatch?.[2] || fallbackFilename);

  const blob = new Blob([response.data], {
    type: response.headers?.['content-type'] || 'application/octet-stream',
  });
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
}

export function StudentsProvider({ children }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/students');
      setStudents(response.data.students);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Populate from DB on first load so other pages
    // (like SessionDetail) can work immediately.
    fetchStudents();
  }, [fetchStudents]);

  const generateStudents = useCallback(async (count, prefix, startingNumber, domain) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.post('/students/generate', {
        count,
        prefix,
        startingNumber,
        domain,
      });
      setStudents(response.data.students);
      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteStudent = useCallback(async (studentId) => {
    try {
      setError(null);
      await api.delete(`/students/${studentId}`);
      setStudents((prev) => prev.filter((s) => s.studentId !== studentId));
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      throw err;
    }
  }, []);

  const deleteAllStudents = useCallback(async () => {
    try {
      setError(null);
      await api.delete('/students/batch/all');
      setStudents([]);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      throw err;
    }
  }, []);

  const mapHexadIds = useCallback(async (text) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.post('/students/map-hexad-ids', { text });
      // Refresh list to pull mapped IDs
      await fetchStudents();
      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchStudents]);

  const syncEnrollment = useCallback(async (sessionId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.post(`/students/sync-enrollment/${sessionId}`);
      await fetchStudents();
      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchStudents]);

  const exportJSON = useCallback(async () => {
    try {
      setError(null);
      const response = await api.get('/export/json', {
        responseType: 'blob',
      });
      downloadFromResponse(response, 'students.json');
    } catch (err) {
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          setError(parsed?.error || err.message);
        } catch {
          setError(err.message);
        }
      } else {
        setError(err.response?.data?.error || err.message);
      }
    }
  }, []);

  const exportCSV = useCallback(async () => {
    try {
      setError(null);
      const response = await api.get('/export/csv', {
        responseType: 'blob',
      });
      downloadFromResponse(response, 'students.csv');
    } catch (err) {
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          setError(parsed?.error || err.message);
        } catch {
          setError(err.message);
        }
      } else {
        setError(err.response?.data?.error || err.message);
      }
    }
  }, []);

  const value = useMemo(
    () => ({
      students,
      loading,
      error,
      fetchStudents,
      generateStudents,
      deleteStudent,
      deleteAllStudents,
      mapHexadIds,
      syncEnrollment,
      exportJSON,
      exportCSV,
    }),
    [
      students,
      loading,
      error,
      fetchStudents,
      generateStudents,
      deleteStudent,
      deleteAllStudents,
      mapHexadIds,
      syncEnrollment,
      exportJSON,
      exportCSV,
    ]
  );

  return <StudentsContext.Provider value={value}>{children}</StudentsContext.Provider>;
}

export function useStudents() {
  const ctx = useContext(StudentsContext);
  if (!ctx) {
    throw new Error('useStudents must be used within a StudentsProvider');
  }
  return ctx;
}
