package com.hexad.studentapp.sync

import android.content.Context

/**
 * Legacy direct Firebase RTDB writer.
 *
 * IMPORTANT: Disabled.
 * All attendance must be sent to backend endpoints only.
 */
@Deprecated("Direct Firebase attendance writes are disabled; use backend submit-attendance API.")
object AttendanceUploader {

    fun uploadAttendance(
        @Suppress("UNUSED_PARAMETER") context: Context,
        @Suppress("UNUSED_PARAMETER") sessionCode: String,
        @Suppress("UNUSED_PARAMETER") studentId: String,
        @Suppress("UNUSED_PARAMETER") latitude: Double?,
        @Suppress("UNUSED_PARAMETER") longitude: Double?,
        @Suppress("UNUSED_PARAMETER") verificationStatus: String
    ) {
        // Intentionally no-op.
        // Keeping this stub prevents accidental Firebase direct writes.
    }
}
