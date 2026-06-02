const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const SimulationLog = require('../models/SimulationLog');
const Student = require('../models/Student');
const apiClient = require('../utils/api-client');
const schemaManager = require('../utils/schemaManager');

// In-memory job tracking
const jobs = {};

// Helper: Apply random delay
function applyDelay(delayRange) {
  if (!delayRange || delayRange.max === 0) return 0;
  const [min, max] = Array.isArray(delayRange)
    ? delayRange
    : [0, delayRange.max || 0];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function classifyHttpError(statusCode) {
  if (statusCode === 400) return 'invalid_request';
  if (statusCode === 401) return 'unauthorized';
  if (statusCode >= 500) return 'backend_issue';
  return 'unknown';
}

function isRetryable(statusCode, errorCode) {
  if (errorCode === 'MISSING_INTERNAL_KEY') return false;
  if (errorCode === 'MISSING_BASE_URL') return false;
  if (!statusCode) return true; // network/timeouts
  if (statusCode >= 500) return true;
  return false;
}

function extractUpstreamError(err) {
  if (!err) return 'Unknown error';
  const status = err.response?.status;
  const data = err.response?.data;
  if (data) {
    if (typeof data === 'string') return data;
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.message === 'string') return data.message;
    try {
      const json = JSON.stringify(data);
      if (json && json !== '{}' && json !== '[]') return `HTTP ${status || 'error'}: ${json}`;
    } catch {
      // ignore
    }
  }
  return err.message || 'Unknown error';
}

// POST: Execute simulation
router.post('/execute', async (req, res) => {
  try {
    const {
      sessionId,
      delayRange = [0, 1000],
      retries = 2,
      studentIds = null, // If null, use all students
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // Create job
    const jobId = uuidv4();
    jobs[jobId] = {
      sessionId,
      status: 'running',
      error: null,
      total: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      retried: 0, // total retry attempts performed
      invalidRequestCount: 0,
      unauthorizedCount: 0,
      backendIssueCount: 0,
      networkErrorCount: 0,
      unknownErrorCount: 0,
      logs: [],
      startTime: Date.now(),
    };

    res.json({ jobId, status: 'queued' });

    // Execute simulation asynchronously (non-blocking)
    setImmediate(() => executeSimulation(jobId, sessionId, delayRange, retries, studentIds));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Internal: Execute simulation logic (trusted mode)
async function executeSimulation(jobId, sessionId, delayRange, retries, studentIds) {
  try {
    // Best-effort: refresh schema from external backend when configured.
    // This keeps payloads aligned with the upstream attendance API.
    const configAtStart = apiClient.getConfig();
    try {
      const status = schemaManager.getSchemaStatus();
      const shouldRefresh = Boolean(configAtStart.baseURL) && (status.isDefault || !status.cached);
      if (shouldRefresh) {
        await schemaManager.fetchSchema(`${configAtStart.baseURL}/schema/attendance`);
      }
    } catch (schemaErr) {
      // Non-fatal: fallback to cached/default schema
      console.warn('⚠ Schema refresh skipped:', schemaErr.message);
    }

    const schema = schemaManager.getSchema();

    // Fetch simulation targets.
    // If explicit IDs are provided, resolve against either local studentId (STD-001)
    // or mapped official hexadStudentId and preserve caller order.
    let students;
    if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
      const ids = studentIds.map((id) => String(id || '').trim()).filter(Boolean);
      const found = await Student.find({
        $or: [
          { studentId: { $in: ids } },
          { hexadStudentId: { $in: ids } },
        ],
      });

      const byLocalId = new Map();
      const byHexadId = new Map();
      for (const doc of found) {
        if (doc.studentId) byLocalId.set(doc.studentId, doc);
        if (doc.hexadStudentId) byHexadId.set(doc.hexadStudentId, doc);
      }

      students = ids.map((requestedId) => {
        const matched = byHexadId.get(requestedId) || byLocalId.get(requestedId);
        if (matched) {
          return {
            ...matched.toObject(),
            effectiveStudentId: requestedId,
          };
        }

        // Fallback for directly pasted IDs not present in simulator DB.
        return {
          studentId: requestedId,
          effectiveStudentId: requestedId,
          name: requestedId,
        };
      });
    } else {
      const all = await Student.find();
      students = all.map((doc) => ({
        ...doc.toObject(),
        effectiveStudentId: doc.hexadStudentId || doc.studentId,
      }));
    }

    jobs[jobId].total = students.length;

    // Process each student
    for (const student of students) {
      const delay = applyDelay(delayRange);

      // Apply delay
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const config = apiClient.getConfig();
      const studentForPayload = {
        ...student,
        studentId: student.effectiveStudentId || student.hexadStudentId || student.studentId,
      };

      const payload = schemaManager.buildPayload(schema, studentForPayload, sessionId, {
        collegeId: config.collegeId,
      });

      // Safety net: some upstream backends require collegeId even if schema fetch fails
      // and we're using the fallback/default schema.
      if ((payload.collegeId === null || payload.collegeId === undefined) && config.collegeId) {
        payload.collegeId = config.collegeId;
      }

      let outcome = 'failed';
      let retryCount = 0;
      let responseCode = null;
      let error = null;
      let errorCategory = null;
      const payloadFieldCount = Object.keys(payload).length;

      const validation = schemaManager.validatePayload(payload, schema);
      if (!validation.valid) {
        outcome = 'failed';
        responseCode = 400;
        error = `Validation: ${validation.errors.join('; ')}`;
        errorCategory = 'invalid_request';
      } else {

        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            await apiClient.submitAttendance(payload);
            outcome = 'success';
            responseCode = 200;
            break;
          } catch (err) {
            if (err.code === 'MISSING_INTERNAL_KEY') {
              jobs[jobId].status = 'error';
              jobs[jobId].error = err.message;
              error = err.message;
              errorCategory = 'unauthorized';
              break;
            }

            if (err.code === 'MISSING_BASE_URL') {
              jobs[jobId].status = 'error';
              jobs[jobId].error = err.message;
              error = err.message;
              errorCategory = 'unknown';
              break;
            }

            responseCode = err.response?.status || null;
            error = extractUpstreamError(err);
            errorCategory = responseCode ? classifyHttpError(responseCode) : 'network';

            const retryable = isRetryable(responseCode, err.code);

            if (attempt < retries && retryable) {
              retryCount++;
              jobs[jobId].retried++;
              // Basic exponential backoff capped at 2s
              const delayMs = Math.min(2000, 250 * Math.pow(2, attempt));
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              continue;
            }

            // Special case: unauthorized should stop the whole job early
            if (responseCode === 401) {
              jobs[jobId].status = 'error';
              jobs[jobId].error = 'Unauthorized (401): wrong or missing internal key';
            }

            break;
          }
        }
      }

      // Log the result with schema details
      const logEntry = {
        sessionId,
        studentId: studentForPayload.studentId,
        status: outcome,
        delayApplied: delay,
        retryCount,
        responseCode,
        error,
        jobId,
        payloadFieldCount,
        errorCategory,
      };

      await SimulationLog.create(logEntry);

      // Update job stats
      jobs[jobId].completed++;
      if (outcome === 'success') jobs[jobId].succeeded++;
      else if (outcome === 'failed') jobs[jobId].failed++;

      if (outcome === 'failed') {
        if (errorCategory === 'invalid_request') jobs[jobId].invalidRequestCount++;
        else if (errorCategory === 'unauthorized') jobs[jobId].unauthorizedCount++;
        else if (errorCategory === 'backend_issue') jobs[jobId].backendIssueCount++;
        else if (errorCategory === 'network') jobs[jobId].networkErrorCount++;
        else jobs[jobId].unknownErrorCount++;
      }

      jobs[jobId].logs.push({
        studentId: studentForPayload.studentId,
        name: student.name || studentForPayload.studentId,
        status: outcome,
        timestamp: new Date().toISOString(),
        fieldCount: payloadFieldCount,
        validationError: outcome === 'failed' ? error : null,
      });

      if (jobs[jobId].status === 'error') {
        break;
      }
    }

    if (jobs[jobId].status !== 'error') {
      jobs[jobId].status = 'completed';
    }
    jobs[jobId].endTime = Date.now();
  } catch (error) {
    console.error('Simulation error:', error);
    jobs[jobId].status = 'error';
    jobs[jobId].error = error.message;
  }
}

// GET: Get simulation status
router.get('/status/:jobId', async (req, res) => {
  try {
    const job = jobs[req.params.jobId];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Get simulation logs
router.get('/logs', async (req, res) => {
  try {
    const { sessionId, limit = 100 } = req.query;
    const query = sessionId ? { sessionId } : {};
    const logs = await SimulationLog.find(query).sort({ createdAt: -1 }).limit(limit);
    res.json({ logs, count: logs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Get job details (for polling)
router.get('/job/:jobId', async (req, res) => {
  try {
    const job = jobs[req.params.jobId];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
