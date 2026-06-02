package com.hexad.studentapp.device

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.util.UUID

/**
 * Stable device identifier for backend device binding.
 * Generated once and persisted securely; never regenerated automatically.
 */
object DeviceIdStore {
    private const val PREFS_NAME = "hexad_secure_prefs"
    private const val KEY_DEVICE_ID = "device_id"

    private fun prefs(context: Context) = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    /** Returns existing deviceId or creates and persists a new one. */
    fun getOrCreate(context: Context): String {
        val appCtx = context.applicationContext
        val p = prefs(appCtx)
        val existing = p.getString(KEY_DEVICE_ID, null)
        if (!existing.isNullOrBlank()) return existing

        val created = UUID.randomUUID().toString()
        p.edit().putString(KEY_DEVICE_ID, created).apply()
        return created
    }

    /** Returns deviceId if exists, otherwise null (does not create). */
    fun get(context: Context): String? {
        val v = prefs(context.applicationContext).getString(KEY_DEVICE_ID, null)
        return v?.takeIf { it.isNotBlank() }
    }
}

