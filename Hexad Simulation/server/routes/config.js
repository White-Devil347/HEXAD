const express = require('express');
const router = express.Router();
const apiClient = require('../utils/api-client');
const ApiConfig = require('../models/ApiConfig');

// GET: Get current config
router.get('/', async (req, res) => {
  try {
    const doc = await ApiConfig.findOne({ key: 'default' }).lean();
    if (doc) {
      apiClient.setConfig(doc);
      return res.json({
        ...apiClient.getConfig(),
        internalKeyPresent: Boolean(process.env.HEXAD_INTERNAL_KEY),
      });
    }

    const seeded = apiClient.getConfig();
    if (seeded.baseURL) {
      await ApiConfig.create({ key: 'default', ...seeded });
      return res.json({
        ...seeded,
        internalKeyPresent: Boolean(process.env.HEXAD_INTERNAL_KEY),
      });
    }

    return res.json({
      ...seeded,
      needsSetup: true,
      internalKeyPresent: Boolean(process.env.HEXAD_INTERNAL_KEY),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// POST: Set config
router.post('/', async (req, res) => {
  try {
    const { baseURL, sessionsEndpoint, attendanceEndpoint, enrollmentEndpointTemplate, collegeId } = req.body;

    if (!baseURL) {
      return res.status(400).json({ error: 'baseURL is required' });
    }

    const nextConfig = {
      baseURL,
      sessionsEndpoint: sessionsEndpoint || '/public/sessions',
      attendanceEndpoint: attendanceEndpoint || '/student/submit-attendance',
      enrollmentEndpointTemplate: enrollmentEndpointTemplate || '/teacher/sessions/{sessionId}/enrolled-students',
      collegeId: collegeId || 'college_001',
    };

    const saved = await ApiConfig.findOneAndUpdate(
      { key: 'default' },
      { key: 'default', ...nextConfig },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    apiClient.setConfig(saved);

    res.json({
      success: true,
      config: apiClient.getConfig(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
