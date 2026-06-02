const mongoose = require('mongoose');

const ApiConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    baseURL: {
      type: String,
      required: true,
      default: () => process.env.HEXAD_API_BASE_URL,
    },
    sessionsEndpoint: { type: String, required: true, default: '/public/sessions' },
    attendanceEndpoint: { type: String, required: true, default: '/student/submit-attendance' },
    enrollmentEndpointTemplate: {
      type: String,
      required: true,
      default: '/teacher/sessions/{sessionId}/enrolled-students',
    },
    collegeId: { type: String, required: true, default: () => process.env.COLLEGE_ID || 'college_001' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApiConfig', ApiConfigSchema);
