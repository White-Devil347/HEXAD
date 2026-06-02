package com.hexad.studentapp.net

/**
 * Legacy Firebase RTDB session validator.
 *
 * V2 uses backend endpoints only (POST /student/validate-code).
 * This object remains only to keep old references from compiling if reintroduced.
 */
@Deprecated("V2 uses backend validate-code; do not validate sessions directly via Firebase.")
object FirebaseSessionValidator {
    data class ValidationResult(val ok: Boolean, val message: String)

    fun validateSessionCode(sessionCode: String, nowMs: Long = System.currentTimeMillis(), callback: (ValidationResult) -> Unit) {
        callback(ValidationResult(false, "Disabled: use backend validate-code"))
    }
}
