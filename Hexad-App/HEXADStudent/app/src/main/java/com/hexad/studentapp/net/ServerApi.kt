package com.hexad.studentapp.net

import kotlinx.coroutines.delay

/**
 * VERY TEMPORARY server API stub.
 * Replace these methods with real Firebase/Flask/etc calls later.
 */
object ServerApi {

    data class ValidationResult(val ok: Boolean, val message: String)

    /**
     * Online validation for a session code.
     * For now: only "12345" is valid.
     */
    suspend fun validateSessionCode(sessionCode: String): ValidationResult {
        delay(300) // simulate network
        return if (sessionCode == "12345") {
            ValidationResult(true, "Session code valid")
        } else {
            ValidationResult(false, "Wrong or expired code")
        }
    }

    /**
     * Online validation for environment configuration.
     * For now: always OK.
     */
    suspend fun validateEnvironment(lat: Double, lng: Double): ValidationResult {
        delay(300)
        return ValidationResult(true, "Environment verified")
    }
}

