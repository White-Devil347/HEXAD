package com.hexad.studentapp

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.hexad.studentapp.data.AttendanceDatabase
import com.hexad.studentapp.data.AttendanceEntity
import com.hexad.studentapp.data.AttendanceRepository
import com.hexad.studentapp.data.AttendanceState
import com.hexad.studentapp.databinding.ActivityFingerprintBinding
import com.hexad.studentapp.flow.FlowExtras
import com.hexad.studentapp.net.NodeStudentApi
import com.hexad.studentapp.net.getNetworkLabel
import com.hexad.studentapp.verification.BackendResultMapper
import com.google.firebase.auth.FirebaseAuth
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class FingerprintActivity : AppCompatActivity() {

    private lateinit var binding: ActivityFingerprintBinding
    private lateinit var repository: AttendanceRepository

    private var sessionCode: String = ""
    private var isOnlineFlow: Boolean = false
    private var internetOk: Boolean = false
    private var lat: Double? = null
    private var lng: Double? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityFingerprintBinding.inflate(layoutInflater)
        setContentView(binding.root)

        repository = AttendanceRepository(this)

        sessionCode = intent.getStringExtra(FlowExtras.EXTRA_SESSION_CODE).orEmpty()
        isOnlineFlow = intent.getBooleanExtra(FlowExtras.EXTRA_IS_ONLINE, false)
        internetOk = intent.getBooleanExtra(FlowExtras.EXTRA_INTERNET_OK, false)

        lat = if (intent.hasExtra(FlowExtras.EXTRA_LAT)) intent.getDoubleExtra(FlowExtras.EXTRA_LAT, 0.0) else null
        lng = if (intent.hasExtra(FlowExtras.EXTRA_LNG)) intent.getDoubleExtra(FlowExtras.EXTRA_LNG, 0.0) else null

        if (sessionCode.isBlank()) {
            Toast.makeText(this, "Missing session code", Toast.LENGTH_SHORT).show()
            binding.authenticateButton.isEnabled = false
        }

        binding.authenticateButton.setOnClickListener {
            if (sessionCode.isBlank()) {
                Toast.makeText(this, "Missing session code", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
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
                onBiometricSuccess()
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
        biometricPrompt.authenticate(builder.build())
    }

    private fun onBiometricSuccess() {
        val user = FirebaseAuth.getInstance().currentUser
        val studentUid = user?.uid
        val displayEmail = user?.email

        if (studentUid.isNullOrBlank()) {
            Toast.makeText(this, "Not logged in. Please login again.", Toast.LENGTH_LONG).show()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        // Disable UI to prevent double submits
        binding.authenticateButton.isEnabled = false

        val timestamp = System.currentTimeMillis()
        val networkText = applicationContext.getNetworkLabel()

        lifecycleScope.launch {
            try {
                val dao = AttendanceDatabase.getInstance(this@FingerprintActivity).attendanceDao()

                // Local duplicate protection
                val existing = withContext(Dispatchers.IO) {
                    dao.getByStudentAndSession(studentUid, sessionCode)
                }
                if (existing != null && existing.state != AttendanceState.FAILED && existing.state != AttendanceState.REJECTED) {
                    Toast.makeText(this@FingerprintActivity, "Attendance already recorded on this device.", Toast.LENGTH_LONG).show()
                    binding.authenticateButton.isEnabled = true
                    return@launch
                }

                val entity = AttendanceEntity(
                    id = UUID.randomUUID().toString(),
                    studentId = studentUid,
                    sessionCode = sessionCode,
                    timestamp = timestamp,
                    latitude = lat,
                    longitude = lng,
                    wifiSsid = networkText,
                    state = AttendanceState.PENDING_LOCAL,
                    failureReason = null,
                    synced = false,
                    verificationStatus = null,
                    flagReason = null,
                    serverMessage = null,
                    lastAttemptAt = null
                )

                // 1) Save locally first (required)
                withContext(Dispatchers.IO) {
                    repository.saveLocal(entity)
                }

                // Always enqueue worker; it will handle offline + retries.
                withContext(Dispatchers.IO) {
                    try {
                        com.hexad.studentapp.sync.WorkSyncScheduler.enqueueOneTime(this@FingerprintActivity)
                    } catch (_: Exception) {
                    }
                }

                // 2) ONLINE strict mode: wait for server reply before showing confirmation
                if (internetOk && isOnlineFlow) {
                    Toast.makeText(this@FingerprintActivity, "Submitting attendance…", Toast.LENGTH_SHORT).show()

                    val attemptAt = System.currentTimeMillis()
                    withContext(Dispatchers.IO) {
                        dao.updateState(entity.id, AttendanceState.SYNCING)
                        dao.updateLastAttemptAt(entity.id, attemptAt)
                    }

                    val submitRes = withContext(Dispatchers.IO) {
                        NodeStudentApi.submitAttendance(
                            context = this@FingerprintActivity,
                            sessionCode = entity.sessionCode,
                            timestamp = entity.timestamp,
                            ssid = networkText,
                            latitude = entity.latitude,
                            longitude = entity.longitude,
                            studentId = studentUid
                        )
                    }

                    when (submitRes) {
                        is NodeStudentApi.ApiResult.Success -> {
                            val parsed = NodeStudentApi.parseSubmitAttendance(submitRes.body)
                            val mapped = BackendResultMapper.fromBackend(
                                verificationStatusRaw = parsed.verificationStatus,
                                flagRaw = parsed.flag,
                                serverMessage = parsed.message
                            )

                            val finalState = mapped.state
                            val uiStatusText = when (finalState) {
                                AttendanceState.CONFIRMED -> {
                                    when (mapped.verificationStatus?.trim()?.lowercase()) {
                                        "verified" -> "Attendance Confirmed"
                                        "flagged" -> "Attendance Recorded (Flagged)"
                                        else -> "Attendance Confirmed"
                                    }
                                }
                                AttendanceState.OUT_OF_GEOFENCE -> "Attendance Recorded (Out of Geofence)"
                                AttendanceState.REJECTED -> (mapped.serverMessage ?: "Attendance rejected")
                                AttendanceState.FAILED -> "Failed"
                                AttendanceState.SYNCING -> "Syncing"
                                AttendanceState.PENDING_LOCAL -> "Queued"
                            }

                            withContext(Dispatchers.IO) {
                                dao.updateServerResult(
                                    id = entity.id,
                                    state = finalState,
                                    synced = finalState == AttendanceState.CONFIRMED || finalState == AttendanceState.REJECTED || finalState == AttendanceState.OUT_OF_GEOFENCE,
                                    verificationStatus = mapped.verificationStatus,
                                    flagReason = mapped.flagReason,
                                    serverMessage = mapped.serverMessage,
                                    failureReason = if (finalState == AttendanceState.REJECTED) mapped.serverMessage else null,
                                    lastAttemptAt = attemptAt
                                )
                            }

                            openConfirmation(
                                entityId = entity.id,
                                sessionCode = entity.sessionCode,
                                networkText = networkText,
                                lat = entity.latitude,
                                lng = entity.longitude,
                                studentId = entity.studentId,
                                studentEmail = displayEmail,
                                state = finalState,
                                statusText = uiStatusText,
                                failureReason = if (finalState == AttendanceState.REJECTED) mapped.serverMessage else null,
                                timestamp = entity.timestamp,
                                verificationStatus = mapped.verificationStatus,
                                flagReason = mapped.flagReason,
                                serverMessage = mapped.serverMessage
                            )
                        }

                        is NodeStudentApi.ApiResult.HttpError -> {
                            when (submitRes.code) {
                                401 -> {
                                    Toast.makeText(this@FingerprintActivity, "Unauthorized. Please login again.", Toast.LENGTH_LONG).show()
                                    startActivity(
                                        Intent(this@FingerprintActivity, LoginActivity::class.java)
                                            .putExtra(LoginActivity.EXTRA_FORCE_LOGIN, true)
                                    )
                                    finish()
                                }

                                400, 403 -> {
                                    val body = submitRes.body.orEmpty()
                                    val lower = body.lowercase()
                                    val msg = if (lower.contains("duplicate") || lower.contains("already")) {
                                        "Attendance already recorded"
                                    } else {
                                        submitRes.body ?: "Attendance rejected"
                                    }

                                    val attemptAt = System.currentTimeMillis()
                                    withContext(Dispatchers.IO) {
                                        dao.updateServerResult(
                                            id = entity.id,
                                            state = AttendanceState.REJECTED,
                                            synced = true,
                                            verificationStatus = "rejected",
                                            flagReason = null,
                                            serverMessage = msg,
                                            failureReason = msg,
                                            lastAttemptAt = attemptAt
                                        )
                                    }

                                    openConfirmation(
                                        entityId = entity.id,
                                        sessionCode = entity.sessionCode,
                                        networkText = networkText,
                                        lat = entity.latitude,
                                        lng = entity.longitude,
                                        studentId = entity.studentId,
                                        studentEmail = displayEmail,
                                        state = AttendanceState.REJECTED,
                                        statusText = "Rejected",
                                        failureReason = msg,
                                        timestamp = entity.timestamp,
                                        verificationStatus = "rejected",
                                        flagReason = null,
                                        serverMessage = msg
                                    )
                                }

                                else -> {
                                    val msg = submitRes.body ?: "Server error (${submitRes.code})"
                                    val attemptAt = System.currentTimeMillis()
                                    withContext(Dispatchers.IO) {
                                        dao.updateServerResult(
                                            id = entity.id,
                                            state = AttendanceState.FAILED,
                                            synced = false,
                                            verificationStatus = null,
                                            flagReason = null,
                                            serverMessage = null,
                                            failureReason = msg,
                                            lastAttemptAt = attemptAt
                                        )
                                    }

                                    openConfirmation(
                                        entityId = entity.id,
                                        sessionCode = entity.sessionCode,
                                        networkText = networkText,
                                        lat = entity.latitude,
                                        lng = entity.longitude,
                                        studentId = entity.studentId,
                                        studentEmail = displayEmail,
                                        state = AttendanceState.FAILED,
                                        statusText = "Failed",
                                        failureReason = msg,
                                        timestamp = entity.timestamp,
                                        verificationStatus = null,
                                        flagReason = null,
                                        serverMessage = null
                                    )
                                }
                            }
                        }

                        is NodeStudentApi.ApiResult.NetworkError -> {
                            // Network error: switch to offline queue automatically
                            val msg = submitRes.message ?: "Network error"

                            withContext(Dispatchers.IO) {
                                dao.updateStateWithReason(entity.id, AttendanceState.PENDING_LOCAL, null)
                            }

                            openConfirmation(
                                entityId = entity.id,
                                sessionCode = entity.sessionCode,
                                networkText = networkText,
                                lat = entity.latitude,
                                lng = entity.longitude,
                                studentId = entity.studentId,
                                studentEmail = displayEmail,
                                state = AttendanceState.PENDING_LOCAL,
                                statusText = "Offline Mode — Attendance Queued",
                                failureReason = msg,
                                timestamp = entity.timestamp,
                                verificationStatus = null,
                                flagReason = null,
                                serverMessage = null
                            )
                        }
                    }
                } else {
                    // Offline flow
                    openConfirmation(
                        entityId = entity.id,
                        sessionCode = entity.sessionCode,
                        networkText = networkText,
                        lat = entity.latitude,
                        lng = entity.longitude,
                        studentId = entity.studentId,
                        studentEmail = displayEmail,
                        state = AttendanceState.PENDING_LOCAL,
                        statusText = "Offline Mode — Attendance Queued",
                        failureReason = null,
                        timestamp = entity.timestamp,
                        verificationStatus = null,
                        flagReason = null,
                        serverMessage = null
                    )
                }

            } catch (t: Throwable) {
                Log.e("ATTENDANCE", "Failed saving/submitting", t)
                binding.authenticateButton.isEnabled = true
                Toast.makeText(this@FingerprintActivity, "Failed: ${t.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun openConfirmation(
        entityId: String,
        sessionCode: String,
        networkText: String,
        lat: Double?,
        lng: Double?,
        studentId: String,
        studentEmail: String?,
        state: AttendanceState,
        statusText: String,
        failureReason: String?,
        timestamp: Long,
        verificationStatus: String?,
        flagReason: String?,
        serverMessage: String?
    ) {
        val i = Intent(this, ConfirmationActivity::class.java)
            .putExtra(FlowExtras.EXTRA_ATTENDANCE_ID, entityId)
            .putExtra(FlowExtras.EXTRA_SESSION_CODE, sessionCode)
            .putExtra(FlowExtras.EXTRA_NETWORK_TEXT, networkText)
            .putExtra(FlowExtras.EXTRA_LAT, lat)
            .putExtra(FlowExtras.EXTRA_LNG, lng)
            .putExtra("extra_student_id", studentId)
            .putExtra("extra_student_email", studentEmail)
            .putExtra("extra_state", state.name)
            .putExtra("extra_status", statusText)
            .putExtra("extra_failure_reason", failureReason)
            .putExtra("extra_timestamp", timestamp)
            .putExtra("extra_verification_status", verificationStatus)
            .putExtra("extra_flag_reason", flagReason)
            .putExtra("extra_server_message", serverMessage)

        startActivity(i)
        finish()
    }
}
