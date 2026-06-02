package com.hexad.studentapp.data

/**
 * Structured local lifecycle state.
 * Backend remains authority for final verification.
 */
enum class AttendanceState {
    PENDING_LOCAL,
    SYNCING,
    CONFIRMED,
    FAILED,
    REJECTED,
    OUT_OF_GEOFENCE
}

