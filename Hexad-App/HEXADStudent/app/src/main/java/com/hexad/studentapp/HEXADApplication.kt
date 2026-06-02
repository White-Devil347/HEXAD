package com.hexad.studentapp

import android.app.Application
import com.google.firebase.database.FirebaseDatabase

class HEXADApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        val rtdbUrl = "https://hexad-3047-default-rtdb.asia-southeast1.firebasedatabase.app"

        try {
            FirebaseDatabase.getInstance(rtdbUrl).setPersistenceEnabled(true)
        } catch (_: IllegalStateException) {
            // Already initialized; ignore
        } catch (t: Throwable) {
            t.printStackTrace()
        }

        try {
            com.hexad.studentapp.sync.WorkSyncScheduler.ensurePeriodic(this)
        } catch (t: Throwable) {
            t.printStackTrace()
        }
    }
}
