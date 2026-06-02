package com.hexad.studentapp.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface AttendanceDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(attendance: AttendanceEntity)

    @Query("SELECT * FROM attendance WHERE synced = 0")
    suspend fun getUnsynced(): List<AttendanceEntity>

    @Query("UPDATE attendance SET synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query("SELECT * FROM attendance ORDER BY timestamp DESC")
    suspend fun getAll(): List<AttendanceEntity>

    @Query("SELECT * FROM attendance ORDER BY timestamp DESC")
    fun getAllFlow(): Flow<List<AttendanceEntity>>

    @Query("SELECT * FROM attendance WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): AttendanceEntity?

    @Query("SELECT * FROM attendance WHERE studentId = :studentId AND sessionCode = :sessionCode LIMIT 1")
    suspend fun getByStudentAndSession(studentId: String, sessionCode: String): AttendanceEntity?

    @Query("UPDATE attendance SET state = :state WHERE id = :id")
    suspend fun updateState(id: String, state: AttendanceState)

    @Query("UPDATE attendance SET state = :state, failureReason = :failureReason WHERE id = :id")
    suspend fun updateStateWithReason(id: String, state: AttendanceState, failureReason: String?)

    @Query("UPDATE attendance SET state = :state, synced = :synced WHERE id = :id")
    suspend fun updateStateAndSynced(id: String, state: AttendanceState, synced: Boolean)

    @Query("UPDATE attendance SET state = :state, failureReason = :failureReason, synced = :synced WHERE id = :id")
    suspend fun updateStateReasonAndSynced(id: String, state: AttendanceState, failureReason: String?, synced: Boolean)

    @Query(
        "UPDATE attendance SET state = :state, synced = :synced, verificationStatus = :verificationStatus, flagReason = :flagReason, serverMessage = :serverMessage, failureReason = :failureReason, lastAttemptAt = :lastAttemptAt WHERE id = :id"
    )
    suspend fun updateServerResult(
        id: String,
        state: AttendanceState,
        synced: Boolean,
        verificationStatus: String?,
        flagReason: String?,
        serverMessage: String?,
        failureReason: String?,
        lastAttemptAt: Long?
    )

    @Query("UPDATE attendance SET lastAttemptAt = :lastAttemptAt WHERE id = :id")
    suspend fun updateLastAttemptAt(id: String, lastAttemptAt: Long?)
}
