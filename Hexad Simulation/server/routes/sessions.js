const express = require('express');
const router = express.Router();
const apiClient = require('../utils/api-client');

// Simple in-memory cache to reduce upstream rate limiting (429).
// Intended for single-instance deployments.
const CACHE_TTL_MS = Number(process.env.SESSIONS_CACHE_TTL_MS || 15000);
const sessionsCache = new Map();

function getCacheKey(collegeId) {
  return String(collegeId || '');
}

function getFreshCache(collegeId) {
  const entry = sessionsCache.get(getCacheKey(collegeId));
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.payload;
}

function getAnyCache(collegeId) {
  const entry = sessionsCache.get(getCacheKey(collegeId));
  return entry ? entry.payload : null;
}

function setCache(collegeId, payload) {
  sessionsCache.set(getCacheKey(collegeId), { ts: Date.now(), payload });
}

// GET: Fetch active sessions from production backend
// Proxies: GET /public/sessions?collegeId=...
router.get('/', async (req, res) => {
  try {
    const collegeId = req.query.collegeId || apiClient.getConfig().collegeId;

    const cached = getFreshCache(collegeId);
    if (cached) {
      return res.json(cached);
    }

    const payload = await apiClient.fetchSessions({ collegeId });

    // Cache successful payloads only.
    if (payload) {
      setCache(collegeId, payload);
    }

    return res.json(payload);
  } catch (error) {
    const status = error.response?.status;
    const retryAfter = error.response?.headers?.['retry-after'];

    // If upstream rate-limited us, serve stale cache if present.
    if (status === 429) {
      const stale = getAnyCache(req.query.collegeId || apiClient.getConfig().collegeId);
      if (stale) {
        if (retryAfter) res.set('Retry-After', retryAfter);
        return res.json(stale);
      }
    }

    if (status) {
      if (retryAfter) res.set('Retry-After', retryAfter);
      return res.status(status).json(error.response?.data || { error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
});

// Back-compat: POST /fetch behaves like GET /
router.post('/fetch', async (req, res) => {
  try {
    const collegeId = req.body?.collegeId || apiClient.getConfig().collegeId;

    const cached = getFreshCache(collegeId);
    if (cached) {
      return res.json(cached);
    }

    const payload = await apiClient.fetchSessions({ collegeId });

    if (payload) {
      setCache(collegeId, payload);
    }

    return res.json(payload);
  } catch (error) {
    const status = error.response?.status;
    const retryAfter = error.response?.headers?.['retry-after'];

    if (status === 429) {
      const stale = getAnyCache(req.body?.collegeId || apiClient.getConfig().collegeId);
      if (stale) {
        if (retryAfter) res.set('Retry-After', retryAfter);
        return res.json(stale);
      }
    }

    if (status) {
      if (retryAfter) res.set('Retry-After', retryAfter);
      return res.status(status).json(error.response?.data || { error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
