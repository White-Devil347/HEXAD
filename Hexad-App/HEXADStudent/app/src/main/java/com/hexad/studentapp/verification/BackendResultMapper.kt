package com.hexad.studentapp.verification

import com.hexad.studentapp.data.AttendanceState

/**
 * Canonical mapping from backend response (verification_status + flag) into local UI/Room state.
 *
 * Rules (as requested):
 * - verification_status = verified -> CONFIRMED
 * - verification_status = flagged -> CONFIRMED (store flagReason)
 * - verification_status = rejected -> REJECTED
 * - flag includes OUTSIDE_GEOFENCE -> OUT_OF_GEOFENCE
 */
object BackendResultMapper {

    data class Mapped(
        val state: AttendanceState,
        val verificationStatus: String?,
        val flagReason: String?,
        val serverMessage: String?
    )

    fun fromBackend(
        verificationStatusRaw: String?,
        flagRaw: String?,
        serverMessage: String?
    ): Mapped {
        val verificationStatus = verificationStatusRaw?.trim()?.lowercase()
        val flag = flagRaw?.trim()

        // OUT_OF_GEOFENCE is a special state.
        val flagUpper = flag?.uppercase()
        if (flagUpper != null && flagUpper.contains("OUTSIDE_GEOFENCE")) {
            return Mapped(
                state = AttendanceState.OUT_OF_GEOFENCE,
                verificationStatus = verificationStatusRaw,
                flagReason = flagRaw,
                serverMessage = serverMessage
            )
        }

        val state = when (verificationStatus) {
            "verified" -> AttendanceState.CONFIRMED
            "flagged" -> AttendanceState.CONFIRMED
            "rejected" -> AttendanceState.REJECTED
            else -> AttendanceState.REJECTED
        }

        return Mapped(
            state = state,
            verificationStatus = verificationStatusRaw,
            flagReason = flagRaw,
            serverMessage = serverMessage
        )
    }
}

