package com.hexad.studentapp.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "attendance",
    indices = [Index(value = ["studentId", "sessionCode"], unique = true)]
)
data class AttendanceEntity(
    @PrimaryKey val id: String,
    val studentId: String,
    val sessionCode: String,
    val timestamp: Long,
    val latitude: Double?,
    val longitude: Double?,
    val wifiSsid: String?,

    val state: AttendanceState,
    val failureReason: String? = null,

    /** Whether this record is finalised server-side (CONFIRMED/REJECTED/OUT_OF_GEOFENCE). */
    val synced: Boolean = false,

    /** Backend response fields (nullable for offline/pending). */
    val verificationStatus: String? = null,
    val flagReason: String? = null,
    val serverMessage: String? = null,

    /** Last time we tried to upload this record (ms). */
    val lastAttemptAt: Long? = null
)
