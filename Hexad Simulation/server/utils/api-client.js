const axios = require('axios');

// In-memory config storage (can be extended to use DB or file)
let apiConfig = {
  // NOTE: Do not hardcode production URLs here; use env vars or persisted config.
  baseURL: process.env.HEXAD_API_BASE_URL || '',
  sessionsEndpoint: '/public/sessions',
  attendanceEndpoint: '/student/submit-attendance',
  enrollmentEndpointTemplate: process.env.HEXAD_ENROLLMENT_ENDPOINT_TEMPLATE || '/teacher/sessions/{sessionId}/enrolled-students',
  collegeId: process.env.COLLEGE_ID || 'college_001',
};

function getInternalKey() {
  return process.env.HEXAD_INTERNAL_KEY || null;
}

function setConfig(config) {
  apiConfig = {
    baseURL: config.baseURL || apiConfig.baseURL,
    sessionsEndpoint: config.sessionsEndpoint || apiConfig.sessionsEndpoint,
    attendanceEndpoint: config.attendanceEndpoint || apiConfig.attendanceEndpoint,
    enrollmentEndpointTemplate: config.enrollmentEndpointTemplate || apiConfig.enrollmentEndpointTemplate,
    collegeId: config.collegeId || apiConfig.collegeId,
  };
}

function getConfig() {
  return { ...apiConfig };
}

function assertConfigured() {
  if (!apiConfig.baseURL) {
    const err = new Error('HEXAD_API_BASE_URL is not configured (set env var or save via /api/config)');
    err.code = 'MISSING_BASE_URL';
    throw err;
  }
}

async function loadConfigFromDb() {
  try {
    const ApiConfig = require('../models/ApiConfig');
    const doc = await ApiConfig.findOne({ key: 'default' }).lean();
    const legacyTemplate = '/teacher/sessions/{sessionId}/details';
    const newTemplate = '/teacher/sessions/{sessionId}/enrolled-students';

    if (doc) {
      // One-time migration: upgrade legacy default template to the new endpoint.
      // Keep user custom templates untouched.
      if (!doc.enrollmentEndpointTemplate || doc.enrollmentEndpointTemplate === legacyTemplate) {
        await ApiConfig.updateOne(
          { key: 'default' },
          { $set: { enrollmentEndpointTemplate: newTemplate } }
        );
        setConfig({ ...doc, enrollmentEndpointTemplate: newTemplate });
      } else {
        setConfig(doc);
      }
      return getConfig();
    }

    // Seed DB with current defaults (env/defaults) only if baseURL is present.
    if (getConfig().baseURL) {
      await ApiConfig.create({ key: 'default', ...getConfig() });
      return getConfig();
    }

    return getConfig();
  } catch (error) {
    console.warn('⚠ Failed to load persisted API config:', error.message);
    return null;
  }
}

async function fetchSessions(sessionFilter = {}) {
  try {
    assertConfigured();
    const url = `${apiConfig.baseURL}${apiConfig.sessionsEndpoint}`;
    const internalKey = getInternalKey();
    const response = await axios.get(url, {
      params: {
        collegeId: sessionFilter.collegeId || apiConfig.collegeId,
      },
      headers: internalKey
        ? {
            'X-Hexad-Internal-Key': internalKey,
          }
        : undefined,
      timeout: 10000,
    });

    return response.data;
  } catch (error) {
    console.error('Failed to fetch sessions:', error.message);
    throw error;
  }
}

async function submitAttendance(payload) {
  try {
    assertConfigured();
    const url = `${apiConfig.baseURL}${apiConfig.attendanceEndpoint}`;
    const internalKey = getInternalKey();
    if (!internalKey) {
      const err = new Error('Missing HEXAD_INTERNAL_KEY for trusted attendance submission');
      err.code = 'MISSING_INTERNAL_KEY';
      throw err;
    }

    const response = await axios.post(url, payload, {
      timeout: 15000,
      headers: {
        'X-Hexad-Internal-Key': internalKey,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Failed to submit attendance:', error.message);
    throw error;
  }
}

function buildEnrollmentPath(sessionId) {
  const template = String(apiConfig.enrollmentEndpointTemplate || '').trim();
  if (!template) return `/teacher/sessions/${encodeURIComponent(sessionId)}/details`;
  if (template.includes('{sessionId}')) {
    return template.replaceAll('{sessionId}', encodeURIComponent(sessionId));
  }
  const trimmed = template.replace(/\/+$/, '');
  return `${trimmed}/${encodeURIComponent(sessionId)}`;
}

async function fetchSessionEnrollment(sessionId) {
  try {
    assertConfigured();
    if (!sessionId) {
      const err = new Error('sessionId is required to fetch enrollment');
      err.code = 'MISSING_SESSION_ID';
      throw err;
    }

    const internalKey = getInternalKey();
    const configuredPath = buildEnrollmentPath(sessionId);
    const fallbackPaths = [
      configuredPath,
      `/teacher/sessions/${encodeURIComponent(sessionId)}/enrolled-students`,
      `/teacher/sessions/${encodeURIComponent(sessionId)}/details`,
    ];

    let lastError = null;
    for (const path of fallbackPaths) {
      const url = `${apiConfig.baseURL}${path.startsWith('/') ? path : `/${path}`}`;
      try {
        const response = await axios.get(url, {
          params: {
            collegeId: apiConfig.collegeId,
          },
          headers: internalKey
            ? {
                'X-Hexad-Internal-Key': internalKey,
              }
            : undefined,
          timeout: 15000,
        });
        return response.data;
      } catch (err) {
        lastError = err;
        const status = err?.response?.status;
        // Only fallback on not-found route shape. For auth/forbidden/validation, stop early.
        if (status && status !== 404) {
          throw err;
        }
      }
    }

    throw lastError || new Error('Failed to fetch session enrollment');
  } catch (error) {
    console.error('Failed to fetch session enrollment:', error.message);
    throw error;
  }
}

async function submitAttendanceWithRetry(payload, maxRetries = 3, delayMs = 1000) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await submitAttendance(payload);
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        // Exponential backoff
        const delay = delayMs * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

module.exports = {
  setConfig,
  getConfig,
  getInternalKey,
  loadConfigFromDb,
  fetchSessions,
  fetchSessionEnrollment,
  submitAttendance,
  submitAttendanceWithRetry,
};
