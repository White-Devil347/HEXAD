const express = require('express');
const router = express.Router();
const schemaManager = require('../utils/schemaManager');
const apiClient = require('../utils/api-client');

/**
 * Helper: Build dynamic base URL from request
 * @param {Object} req - Express request object
 * @returns {string} - Base URL (e.g., http://localhost:5000 or https://hexad.onrender.com)
 */
function getBaseUrl(req) {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:5000';
  return `${protocol}://${host}`;
}

// GET: Get current schema with dynamic endpoint
router.get('/attendance', async (req, res) => {
  try {
    const schema = schemaManager.getSchema();
    const status = schemaManager.getSchemaStatus();

    // Dynamically set endpoint based on current request
    if (schema) {
      schema.endpoint = `${getBaseUrl(req)}/api/attendance`;
    }

    res.json({
      schema,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Fetch and cache schema from external API
router.post('/attendance/fetch', async (req, res) => {
  try {
    const config = apiClient.getConfig();
    let schemaEndpoint = req.body.endpoint;

    // Try to construct schema endpoint from config if not provided
    if (!schemaEndpoint && config.baseURL) {
      schemaEndpoint = `${config.baseURL}/schema/attendance`;
    }

    if (!schemaEndpoint) {
      return res.status(400).json({
        error: 'No schema endpoint provided. Configure API first.',
      });
    }

    const schema = await schemaManager.fetchSchema(schemaEndpoint);
    const status = schemaManager.getSchemaStatus();

    // Override endpoint with dynamic URL based on current server
    if (schema) {
      schema.endpoint = `${getBaseUrl(req)}/api/attendance`;
    }

    res.json({
      schema,
      status,
      message: 'Schema fetched and cached successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const status = schemaManager.getSchemaStatus();
    res.status(500).json({
      error: error.message,
      status,
      fallback: 'Using default or cached schema',
    });
  }
});

// GET: Get schema status
router.get('/status', (req, res) => {
  try {
    const status = schemaManager.getSchemaStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Clear schema cache
router.delete('/cache/clear', (req, res) => {
  try {
    schemaManager.clearSchemaCache();
    res.json({
      success: true,
      message: 'Schema cache cleared',
      status: schemaManager.getSchemaStatus(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Validate payload against schema
router.post('/attendance/validate', (req, res) => {
  try {
    const { payload } = req.body;

    if (!payload) {
      return res.status(400).json({ error: 'No payload provided' });
    }

    const schema = schemaManager.getSchema();
    const validation = schemaManager.validatePayload(payload, schema);

    res.json({
      valid: validation.valid,
      errors: validation.errors,
      fieldCount: Object.keys(payload).length,
      expectedFields: Object.keys(schema.fields).length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
