package com.hexad.studentapp.sync

import android.content.Context
import android.util.Log
import com.hexad.studentapp.data.AttendanceDatabase
import com.hexad.studentapp.data.AttendanceState
import com.hexad.studentapp.net.NodeStudentApi
import com.hexad.studentapp.verification.BackendResultMapper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Sync helper: uploads unsynced Room records to backend.
 * Returns Pair(successCount, failureMessages)
 */
object SyncManager {

    suspend fun syncPendingNowDetailed(context: Context): Pair<Int, List<String>> = withContext(Dispatchers.IO) {
        var successCount = 0
        val failures = mutableListOf<String>()

        val db = AttendanceDatabase.getInstance(context)
        val dao = db.attendanceDao()
        val unsynced = dao.getUnsynced()

        for (att in unsynced) {
            try {
                val attemptAt = System.currentTimeMillis()

                // PENDING_LOCAL -> SYNCING
                dao.updateState(att.id, AttendanceState.SYNCING)
                dao.updateLastAttemptAt(att.id, attemptAt)

                val res = NodeStudentApi.submitAttendance(
                    context = context,
                    sessionCode = att.sessionCode,
                    timestamp = att.timestamp,
                    ssid = att.wifiSsid,
                    latitude = att.latitude,
                    longitude = att.longitude,
                    studentId = att.studentId
                )

                when (res) {
                    is NodeStudentApi.ApiResult.Success -> {
                        val parsed = NodeStudentApi.parseSubmitAttendance(res.body)
                        val mapped = BackendResultMapper.fromBackend(
                            verificationStatusRaw = parsed.verificationStatus,
                            flagRaw = parsed.flag,
                            serverMessage = parsed.message
                        )

                        val finalState = mapped.state
                        val finalSynced = finalState == AttendanceState.CONFIRMED || finalState == AttendanceState.REJECTED || finalState == AttendanceState.OUT_OF_GEOFENCE

                        dao.updateServerResult(
                            id = att.id,
                            state = finalState,
                            synced = finalSynced,
                            verificationStatus = mapped.verificationStatus,
                            flagReason = mapped.flagReason,
                            serverMessage = mapped.serverMessage,
                            failureReason = if (finalState == AttendanceState.REJECTED) mapped.serverMessage else null,
                            lastAttemptAt = attemptAt
                        )

                        if (finalState == AttendanceState.CONFIRMED || finalState == AttendanceState.OUT_OF_GEOFENCE || finalState == AttendanceState.REJECTED) {
                            successCount++
                        }
                    }

                    is NodeStudentApi.ApiResult.HttpError -> {
                        when (res.code) {
                            401 -> {
                                failures.add("401 Unauthorized")
                                // Stop immediately; tokens invalid, worker should not keep retrying.
                                break
                            }

                            in 400..499 -> {
                                // Non-retryable (invalid/duplicate/rejected).
                                val msg = res.body ?: "Rejected (${res.code})"
                                dao.updateServerResult(
                                    id = att.id,
                                    state = AttendanceState.REJECTED,
                                    synced = true,
                                    verificationStatus = "rejected",
                                    flagReason = null,
                                    serverMessage = msg,
                                    failureReason = msg,
                                    lastAttemptAt = attemptAt
                                )
                                failures.add("id=${att.id} rejected http=${res.code}")
                            }

                            else -> {
                                // 5xx/other server errors: retry later.
                                val msg = res.body ?: "HTTP ${res.code}"
                                dao.updateServerResult(
                                    id = att.id,
                                    state = AttendanceState.FAILED,
                                    synced = false,
                                    verificationStatus = null,
                                    flagReason = null,
                                    serverMessage = null,
                                    failureReason = msg,
                                    lastAttemptAt = attemptAt
                                )
                                failures.add("id=${att.id} http=${res.code}")
                            }
                        }
                    }

                    is NodeStudentApi.ApiResult.NetworkError -> {
                        // Network error: stay queued for retry; don't mark FAILED permanently.
                        dao.updateState(att.id, AttendanceState.PENDING_LOCAL)
                        failures.add("id=${att.id} network=${res.message}")
                    }
                }

            } catch (ex: Exception) {
                Log.e("SYNC", "Upload failed for id=${att.id}", ex)
                try {
                    dao.updateStateWithReason(att.id, AttendanceState.FAILED, ex.message)
                } catch (_: Throwable) {
                }
                failures.add("id=${att.id} error=${ex.message}")
            }
        }

        Pair(successCount, failures)
    }
}
