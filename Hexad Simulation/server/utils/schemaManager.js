const axios = require('axios');
const apiClient = require('./api-client');

// In-memory schema cache
let schemaCache = null;
let schemaCacheTime = null;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Default schema (fallback) - endpoint is set dynamically by routes
const DEFAULT_SCHEMA = {
  version: '1.0',
  endpoint: '{{DYNAMIC_ENDPOINT}}', // Set by schema routes based on request
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  fields: {
    studentId: {
      type: 'string',
      required: true,
      description: 'Unique student identifier',
    },
    sessionId: {
      type: 'string',
      required: true,
      description: 'Session ID',
    },
    timestamp: {
      type: 'string',
      format: 'ISO8601',
      required: true,
      description: 'Attendance timestamp',
    },
  },
  validation: {
    maxPayloadSize: 1024,
  },
};

/**
 * Fetch schema from external API
 * @param {string} endpoint - The schema endpoint URL
 * @returns {Promise<Object>} - Schema object
 */
async function fetchSchema(endpoint) {
  try {
    if (!endpoint) {
      console.warn('No schema endpoint configured, using default schema');
      return DEFAULT_SCHEMA;
    }

    const response = await axios.get(endpoint, {
      timeout: 5000,
    });

    if (!isSchemaValid(response.data)) {
      console.warn('Invalid schema received, using default');
      return DEFAULT_SCHEMA;
    }

    // Cache the schema
    schemaCache = response.data;
    schemaCacheTime = Date.now();

    console.log('✓ Schema fetched and cached successfully');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch schema:', error.message);
    // Return cached schema if available
    if (schemaCache) {
      console.log('⚠ Using cached schema due to fetch error');
      return schemaCache;
    }
    // Otherwise return default
    console.log('⚠ Using default schema');
    return DEFAULT_SCHEMA;
  }
}

/**
 * Validate schema structure
 * @param {Object} schema - Schema to validate
 * @returns {boolean} - Is valid
 */
function isSchemaValid(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (!schema.version) return false;
  if (!schema.endpoint || !schema.method) return false;
  if (!schema.fields || typeof schema.fields !== 'object') return false;

  // Check fields have required properties
  for (const [fieldName, fieldConfig] of Object.entries(schema.fields)) {
    if (!fieldConfig.type) return false;
    if (typeof fieldConfig.required !== 'boolean') return false;
  }

  return true;
}

/**
 * Get cached schema
 * @returns {Object} - Cached schema or default
 */
function getSchema() {
  if (schemaCache && schemaCacheTime && Date.now() - schemaCacheTime < CACHE_DURATION) {
    return schemaCache;
  }
  return schemaCache || DEFAULT_SCHEMA;
}

/**
 * Check if cached schema is expired
 * @returns {boolean} - Is expired
 */
function isSchemaCacheExpired() {
  if (!schemaCacheTime) return true;
  return Date.now() - schemaCacheTime > CACHE_DURATION;
}

/**
 * Clear schema cache
 */
function clearSchemaCache() {
  schemaCache = null;
  schemaCacheTime = null;
}

/**
 * Build attendance payload dynamically based on schema
 * @param {Object} schema - Schema
 * @param {Object} student - Student object
 * @param {string} sessionId - Session ID
 * @returns {Object} - Built payload
 */
function buildPayload(schema, student, sessionId, context = {}) {
  const payload = {};

  const collegeId = context?.collegeId;
  const timestamp = context?.timestamp;

  Object.entries(schema.fields).forEach(([fieldName, fieldConfig]) => {
    // Map known fields
    if (fieldName === 'studentId') {
      payload[fieldName] = student.studentId;
    } else if (fieldName === 'sessionId') {
      payload[fieldName] = sessionId;
    } else if (fieldName === 'timestamp') {
      payload[fieldName] = timestamp || new Date().toISOString();
    } else if (fieldName === 'collegeId') {
      payload[fieldName] = collegeId || fieldConfig.default || null;
    } else if (fieldName === 'attendanceStatus') {
      payload[fieldName] = fieldConfig.default || 'present';
    } else if (fieldName === 'status') {
      payload[fieldName] = fieldConfig.default || 'present';
    } else if (!fieldConfig.required) {
      // Optional fields: null or default value
      payload[fieldName] = fieldConfig.default || null;
    } else {
      // Required field without mapping: null (will fail validation)
      payload[fieldName] = null;
    }
  });

  return payload;
}

/**
 * Validate payload against schema
 * @param {Object} payload - Payload to validate
 * @param {Object} schema - Schema to validate against
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validatePayload(payload, schema) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload is not an object'] };
  }

  // Check required fields
  Object.entries(schema.fields).forEach(([fieldName, fieldConfig]) => {
    if (fieldConfig.required) {
      if (payload[fieldName] === null || payload[fieldName] === undefined) {
        errors.push(`Missing required field: ${fieldName}`);
      }
    }
  });

  // Check field types
  Object.entries(payload).forEach(([fieldName, value]) => {
    const fieldConfig = schema.fields[fieldName];

    if (!fieldConfig) {
      // Unknown field - log warning but don't fail
      console.warn(`Unknown field in payload: ${fieldName}`);
      return;
    }

    // Type checking
    if (value !== null && value !== undefined) {
      if (fieldConfig.type === 'string' && typeof value !== 'string') {
        errors.push(`Field ${fieldName} must be string, got ${typeof value}`);
      } else if (fieldConfig.type === 'number' && typeof value !== 'number') {
        errors.push(`Field ${fieldName} must be number, got ${typeof value}`);
      } else if (fieldConfig.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`Field ${fieldName} must be boolean, got ${typeof value}`);
      }

      // Enum validation
      if (fieldConfig.enum && !fieldConfig.enum.includes(value)) {
        errors.push(`Field ${fieldName} must be one of: ${fieldConfig.enum.join(', ')}`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Get schema status
 * @returns {Object} - Status object
 */
function getSchemaStatus() {
  const isExpired = isSchemaCacheExpired();
  return {
    loaded: !!schemaCache,
    cached: !isExpired,
    version: schemaCache?.version || DEFAULT_SCHEMA.version,
    lastUpdated: schemaCacheTime ? new Date(schemaCacheTime).toISOString() : null,
    fieldCount: Object.keys(getSchema().fields).length,
    isDefault: schemaCache === null,
  };
}

module.exports = {
  fetchSchema,
  getSchema,
  isSchemaValid,
  buildPayload,
  validatePayload,
  getSchemaStatus,
  clearSchemaCache,
  isSchemaCacheExpired,
  DEFAULT_SCHEMA,
};
