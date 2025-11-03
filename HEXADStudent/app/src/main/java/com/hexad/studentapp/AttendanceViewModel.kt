// filepath: c:\Users\Ajay\AndroidStudioProjects\HEXADStudent\app\src\main\java\com\hexad\studentapp\AttendanceViewModel.kt
package com.hexad.studentapp

import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import java.util.UUID

// Simple in-memory model for early scaffolding. Will be replaced by Room in Milestone 2.
data class AttendanceRecord(
    val id: String = UUID.randomUUID().toString(),
    val timestampMillis: Long,
    val status: String // e.g., "PRESENT", "ABSENT"
)

class AttendanceViewModel : ViewModel() {
    private val _records = mutableStateListOf<AttendanceRecord>()
    val records: List<AttendanceRecord> get() = _records

    fun checkInNow() {
        _records.add(
            AttendanceRecord(
                timestampMillis = System.currentTimeMillis(),
                status = "PRESENT"
            )
        )
    }
}

