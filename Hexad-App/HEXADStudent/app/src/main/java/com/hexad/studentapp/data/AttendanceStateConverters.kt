package com.hexad.studentapp.data

import androidx.room.TypeConverter

class AttendanceStateConverters {
    @TypeConverter
    fun fromState(state: AttendanceState): String = state.name

    @TypeConverter
    fun toState(value: String): AttendanceState {
        return runCatching { AttendanceState.valueOf(value) }
            .getOrElse { AttendanceState.PENDING_LOCAL }
    }
}

