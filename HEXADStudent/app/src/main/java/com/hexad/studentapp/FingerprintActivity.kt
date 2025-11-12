package com.hexad.studentapp

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.hexad.studentapp.databinding.ActivityFingerprintBinding
import java.util.Date

class FingerprintActivity : AppCompatActivity() {

    private lateinit var binding: ActivityFingerprintBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityFingerprintBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.authenticateButton.setOnClickListener {
            authenticate()
        }
    }

    private fun authenticate() {
        val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        val biometricManager = BiometricManager.from(this)
        val can = biometricManager.canAuthenticate(authenticators)
        if (can == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            Toast.makeText(this, "No biometrics enrolled. Use device lock.", Toast.LENGTH_SHORT).show()
        }
        if (can != BiometricManager.BIOMETRIC_SUCCESS && can != BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            Toast.makeText(this, "Biometric unavailable", Toast.LENGTH_SHORT).show()
            return
        }

        val executor = ContextCompat.getMainExecutor(this)
        val biometricPrompt = BiometricPrompt(this, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                Toast.makeText(applicationContext, "Error: $errString", Toast.LENGTH_SHORT).show()
            }

            override fun onAuthenticationFailed() {
                super.onAuthenticationFailed()
                Toast.makeText(applicationContext, "Fingerprint not recognized", Toast.LENGTH_SHORT).show()
            }

            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                // Save attendance
                val prefs = getSharedPreferences("attendance", MODE_PRIVATE)
                val timestamp = Date().toString()
                val data = "student_id: S001\nsession_code: 12345\ntimestamp: $timestamp\nverification_status: success"
                prefs.edit().putString("last_attendance", data).apply()
                Toast.makeText(applicationContext, "Attendance saved", Toast.LENGTH_SHORT).show()
                startActivity(Intent(this@FingerprintActivity, ConfirmationActivity::class.java))
            }
        })

        val builder = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Fingerprint Verification")
            .setSubtitle("Use fingerprint or screen lock")
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            builder.setAllowedAuthenticators(authenticators)
        } else {
            @Suppress("DEPRECATION")
            builder.setDeviceCredentialAllowed(true)
        }
        val promptInfo = builder.build()
        biometricPrompt.authenticate(promptInfo)
    }
}
