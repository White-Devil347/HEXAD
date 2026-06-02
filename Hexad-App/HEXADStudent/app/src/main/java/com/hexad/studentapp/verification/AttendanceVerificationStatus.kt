package com.hexad.studentapp.verification

/**
 * Canonical verification status for an attendance record.
 *
 * New rules:
 * - If SSID and location are both true (server-verified) => VERIFIED
 * - If exactly one is true => UNVERIFIED
 * - If both are false => ACTION_NEEDED
 */
enum class AttendanceVerificationStatus {
    VERIFIED,
    UNVERIFIED,
    ACTION_NEEDED
}

object AttendanceStatusMapper {
    fun fromServerChecks(
        ssidVerified: Boolean,
        locationVerified: Boolean
    ): AttendanceVerificationStatus {
        return when {
            ssidVerified && locationVerified -> AttendanceVerificationStatus.VERIFIED
            !ssidVerified && !locationVerified -> AttendanceVerificationStatus.ACTION_NEEDED
            else -> AttendanceVerificationStatus.UNVERIFIED
        }
    }
}
