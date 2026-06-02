package com.hexad.studentapp.sync

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class AttendanceSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return try {
            val (successCount, failures) = SyncManager.syncPendingNowDetailed(applicationContext)
            Log.d(TAG, "Sync finished: successCount=$successCount failures=${failures.size}")

            // Token invalid -> stop and let UI force login.
            if (failures.any { it.contains("401") }) {
                return Result.failure()
            }

            // If there are only non-retryable rejections, don't keep retrying.
            val hasRetryable = failures.any { it.contains("network=") || it.contains("http=5") || it.contains("http=502") || it.contains("http=503") || it.contains("http=504") }

            if (failures.isEmpty()) {
                Result.success()
            } else if (hasRetryable) {
                Result.retry()
            } else {
                Result.success()
            }
        } catch (t: Throwable) {
            Log.e(TAG, "Sync crashed", t)
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "AttendanceSyncWorker"
    }
}
