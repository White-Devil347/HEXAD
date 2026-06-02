package com.hexad.studentapp.sync

import com.hexad.studentapp.data.AttendanceEntity

/**
 * Legacy Firebase direct-sync repository.
 *
 * IMPORTANT: Disabled.
 * Attendance must go through backend APIs only.
 */
@Deprecated("Direct Firebase attendance writes are disabled; use backend APIs.")
class FirebaseSyncRepository {

    suspend fun pushAttendance(@Suppress("UNUSED_PARAMETER") att: AttendanceEntity) {
        // No-op: intentionally disabled.
        throw UnsupportedOperationException("Direct Firebase attendance writes are disabled; use backend submit-attendance API.")
    }
}
