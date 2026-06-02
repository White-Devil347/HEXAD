package com.hexad.studentapp.data

import android.content.Context

class AttendanceRepository(context: Context) {

    private val db = AttendanceDatabase.getInstance(context)
    private val dao = db.attendanceDao()

    suspend fun saveLocal(entity: AttendanceEntity) {
        dao.insert(entity)
    }

    // For now, no-op sync until Firebase is fully configured
    suspend fun syncPending() {
        // Intentionally left blank: local-only mode
    }
}
