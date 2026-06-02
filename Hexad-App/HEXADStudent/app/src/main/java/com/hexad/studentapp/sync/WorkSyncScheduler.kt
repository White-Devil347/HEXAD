package com.hexad.studentapp.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object WorkSyncScheduler {
    private const val UNIQUE_ONE_TIME_NAME = "attendance_sync_one_time"
    private const val UNIQUE_PERIODIC_NAME = "attendance_sync_periodic"

    fun enqueueOneTime(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<AttendanceSyncWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context)
            .enqueueUniqueWork(UNIQUE_ONE_TIME_NAME, ExistingWorkPolicy.KEEP, request)
    }

    fun ensurePeriodic(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = PeriodicWorkRequestBuilder<AttendanceSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(UNIQUE_PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }
}

