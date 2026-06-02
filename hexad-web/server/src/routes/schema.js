const express = require('express');
const router = express.Router();

const { response } = require('../utils');
const { getSchemaResponse } = require('../config/schema');

// Versioned schema: /api/schema/v1/attendance
router.get('/v:version/:name', (req, res) => {
    const version = `v${String(req.params.version || '').trim()}`;
    const name = req.params.name;
    const schema = getSchemaResponse(version, name);
    if (!schema) return response.notFound(res, 'Schema not found');
    return res.json(schema);
});

// Default version (v1): /api/schema/attendance
router.get('/:name', (req, res) => {
    const name = req.params.name;
    const schema = getSchemaResponse('v1', name);
    if (!schema) return response.notFound(res, 'Schema not found');
    return res.json(schema);
});

module.exports = router;
