const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
      match: [/^STD-\d{3}$/, 'Student ID must match STD-001 format'],
    },
    firstName: {
      type: String,
      default: null,
    },
    lastName: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      default: null,
    },
    gender: {
      type: String,
      enum: ['M', 'F', 'Other', null],
      default: null,
    },
    domain: {
      type: String,
      required: true,
    },

    // After importing/enrolling into the official Hexad system, students will be assigned
    // a different canonical ID. Store it here so simulations can submit attendance using
    // the enrolled IDs instead of local STD-001 IDs.
    hexadStudentId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Student', studentSchema);
