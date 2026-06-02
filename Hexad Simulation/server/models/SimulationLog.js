const mongoose = require('mongoose');

const simulationLogSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'retry'],
      required: true,
    },
    delayApplied: {
      type: Number,
      default: 0,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    responseCode: {
      type: Number,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    jobId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SimulationLog', simulationLogSchema);
