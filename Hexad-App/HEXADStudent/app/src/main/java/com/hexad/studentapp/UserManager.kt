package com.hexad.studentapp

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import java.security.MessageDigest

object UserManager {
    private const val PREFS = "hexad_prefs"
    private const val KEY_USERNAME = "registered_username"
    private const val KEY_PASS_HASH = "registered_pass_hash"

    private fun prefs(ctx: Context): SharedPreferences = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun hash(password: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(password.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(digest, Base64.NO_WRAP)
    }

    fun register(context: Context, username: String, password: String): Boolean {
        if (username.isBlank() || password.isBlank()) return false
        val p = prefs(context)
        val hash = hash(password)
        p.edit().putString(KEY_USERNAME, username).putString(KEY_PASS_HASH, hash).apply()
        return true
    }

    fun isRegistered(context: Context): Boolean {
        val p = prefs(context)
        return p.contains(KEY_USERNAME) && p.contains(KEY_PASS_HASH)
    }

    fun validate(context: Context, username: String, password: String): Boolean {
        val p = prefs(context)
        val storedUser = p.getString(KEY_USERNAME, null) ?: return false
        val storedHash = p.getString(KEY_PASS_HASH, null) ?: return false
        if (storedUser != username) return false
        val hash = hash(password)
        return storedHash == hash
    }

    fun getRegisteredUsername(context: Context): String? = prefs(context).getString(KEY_USERNAME, null)
}
