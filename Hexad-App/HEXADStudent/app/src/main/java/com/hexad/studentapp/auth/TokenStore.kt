package com.hexad.studentapp.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object TokenStore {
    private const val PREFS_NAME = "hexad_secure_prefs"
    private const val KEY_ID_TOKEN = "id_token"

    private fun prefs(context: Context) = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun save(context: Context, token: String) {
        prefs(context.applicationContext)
            .edit()
            .putString(KEY_ID_TOKEN, token)
            .apply()
    }

    fun get(context: Context): String? {
        return prefs(context.applicationContext)
            .getString(KEY_ID_TOKEN, null)
            ?.takeIf { it.isNotBlank() }
    }

    fun clear(context: Context) {
        prefs(context.applicationContext)
            .edit()
            .remove(KEY_ID_TOKEN)
            .apply()
    }
}

