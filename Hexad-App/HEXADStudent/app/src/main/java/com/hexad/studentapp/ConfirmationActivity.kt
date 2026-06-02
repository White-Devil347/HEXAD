package com.hexad.studentapp

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.FirebaseAuth
import com.hexad.studentapp.data.AttendanceDatabase
import com.hexad.studentapp.data.AttendanceEntity
import com.hexad.studentapp.data.AttendanceState
import com.hexad.studentapp.databinding.ActivityConfirmationBinding
import com.hexad.studentapp.flow.FlowExtras
import com.hexad.studentapp.sync.WorkSyncScheduler
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ConfirmationActivity : AppCompatActivity() {

    private lateinit var binding: ActivityConfirmationBinding
    private val formatter = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityConfirmationBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Micro UX polish: fade-in
        binding.root.alpha = 0f
        binding.root.animate().alpha(1f).setDuration(180).start()

        val attendanceId = intent.getStringExtra(FlowExtras.EXTRA_ATTENDANCE_ID)

        val studentIdExtra = intent.getStringExtra("extra_student_id")
        val studentEmailExtra = intent.getStringExtra("extra_student_email")
        val sessionCodeExtra = intent.getStringExtra(FlowExtras.EXTRA_SESSION_CODE)
        val statusExtra = intent.getStringExtra("extra_status")
        val timestampExtra = intent.getLongExtra("extra_timestamp", -1L)
        val networkTextExtra = intent.getStringExtra(FlowExtras.EXTRA_NETWORK_TEXT)
        val failureReasonExtra = intent.getStringExtra("extra_failure_reason")

        val verificationStatusExtra = intent.getStringExtra("extra_verification_status")
        val flagReasonExtra = intent.getStringExtra("extra_flag_reason")
        val serverMessageExtra = intent.getStringExtra("extra_server_message")

        val stateExtra = intent.getStringExtra("extra_state")
        val parsedState = runCatching { stateExtra?.let { AttendanceState.valueOf(it) } }.getOrNull()

        val latExtra = if (intent.hasExtra(FlowExtras.EXTRA_LAT)) intent.getDoubleExtra(FlowExtras.EXTRA_LAT, 0.0) else null
        val lngExtra = if (intent.hasExtra(FlowExtras.EXTRA_LNG)) intent.getDoubleExtra(FlowExtras.EXTRA_LNG, 0.0) else null

        val firebaseEmail = FirebaseAuth.getInstance().currentUser?.email

        fun formatTime(ts: Long?): String = if (ts != null && ts > 0) formatter.format(Date(ts)) else "-"

        fun applyStatusVisuals(state: AttendanceState?, verificationStatus: String?, flagReason: String?) {
            val badgeText: String
            val color: Int
            val iconRes: Int

            when (state) {
                AttendanceState.PENDING_LOCAL -> {
                    badgeText = "Queued"
                    color = 0xFF1565C0.toInt() // blue
                    iconRes = android.R.drawable.ic_popup_sync
                }
                AttendanceState.SYNCING -> {
                    badgeText = "Syncing"
                    color = 0xFFF9A825.toInt() // yellow
                    iconRes = android.R.drawable.ic_popup_sync
                }
                AttendanceState.CONFIRMED -> {
                    val v = verificationStatus?.trim()?.lowercase()
                    badgeText = if (v == "flagged") "Confirmed (Flagged)" else "Confirmed"
                    color = 0xFF2E7D32.toInt() // green
                    iconRes = android.R.drawable.checkbox_on_background
                }
                AttendanceState.OUT_OF_GEOFENCE -> {
                    badgeText = "Out of Geofence"
                    color = 0xFF6A1B9A.toInt() // purple
                    iconRes = android.R.drawable.ic_dialog_map
                }
                AttendanceState.REJECTED -> {
                    badgeText = "Rejected"
                    color = 0xFFEF6C00.toInt() // orange
                    iconRes = android.R.drawable.ic_delete
                }
                AttendanceState.FAILED -> {
                    badgeText = "Failed"
                    color = 0xFFC62828.toInt() // red
                    iconRes = android.R.drawable.stat_notify_error
                }
                null -> {
                    badgeText = "Status"
                    color = 0xFFB0BEC5.toInt()
                    iconRes = android.R.drawable.ic_dialog_info
                }
            }

            binding.statusTitle.text = badgeText
            binding.statusTitle.setTextColor(color)
            binding.statusIcon.setImageResource(iconRes)

            binding.flagChip.isVisible = !flagReason.isNullOrBlank()
            binding.flagChip.text = flagReason ?: ""
        }

        fun setSummaryMessage(state: AttendanceState?, statusText: String?, serverMessage: String?, failureReason: String?): String {
            return when (state) {
                AttendanceState.PENDING_LOCAL -> "No internet — attendance queued and will sync automatically."
                AttendanceState.SYNCING -> "Syncing with server…"
                AttendanceState.CONFIRMED -> serverMessage?.takeIf { it.isNotBlank() } ?: (statusText ?: "Attendance confirmed")
                AttendanceState.OUT_OF_GEOFENCE -> serverMessage?.takeIf { it.isNotBlank() } ?: "Recorded but outside allowed location."
                AttendanceState.REJECTED -> serverMessage?.takeIf { it.isNotBlank() } ?: (failureReason ?: "Attendance rejected")
                AttendanceState.FAILED -> failureReason?.takeIf { it.isNotBlank() } ?: "Couldn’t reach server. Try again when online."
                null -> statusText ?: ""
            }
        }

        fun detailsText(att: AttendanceEntity?): String {
            val studentUid = att?.studentId ?: studentIdExtra
            val email = studentEmailExtra ?: firebaseEmail
            val time = formatTime(att?.timestamp ?: timestampExtra.takeIf { it > 0 })
            val session = att?.sessionCode ?: sessionCodeExtra
            val network = att?.wifiSsid ?: networkTextExtra
            val lat = att?.latitude ?: latExtra
            val lng = att?.longitude ?: lngExtra
            val v = att?.verificationStatus ?: verificationStatusExtra
            val flag = att?.flagReason ?: flagReasonExtra

            return buildString {
                append("Student UID: ${studentUid ?: "-"}\n")
                append("Email: ${email ?: "-"}\n")
                append("Session: ${session ?: "-"}\n")
                append("Time: $time\n")
                append("Network: ${network ?: "-"}\n")
                append("Latitude: ${lat?.toString() ?: "-"}\n")
                append("Longitude: ${lng?.toString() ?: "-"}\n")
                append("Verification: ${v ?: "-"}\n")
                append("Flag: ${flag ?: "-"}\n")
            }
        }

        // Initial paint from extras
        applyStatusVisuals(parsedState, verificationStatusExtra, flagReasonExtra)
        binding.messageText.text = setSummaryMessage(parsedState, statusExtra, serverMessageExtra, failureReasonExtra)
        binding.detailsText.text = detailsText(null)

        binding.detailsCard.setOnClickListener {
            val now = !binding.detailsText.isVisible
            binding.detailsText.isVisible = now
            binding.detailsChevron.rotation = if (now) 180f else 0f
        }

        binding.retryButton.setOnClickListener {
            // Retry means: enqueue worker and return to session screen.
            WorkSyncScheduler.enqueueOneTime(this)
            val i = Intent(this, SessionCodeActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            startActivity(i)
            finish()
        }

        binding.backToSessionButton.setOnClickListener {
            val i = Intent(this, SessionCodeActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            startActivity(i)
            finish()
        }

        // Prefer Room-backed truth (includes verificationStatus + flags) if present.
        if (!attendanceId.isNullOrBlank()) {
            lifecycleScope.launch(Dispatchers.IO) {
                val att = runCatching {
                    AttendanceDatabase.getInstance(this@ConfirmationActivity)
                        .attendanceDao()
                        .getById(attendanceId)
                }.getOrNull()

                withContext(Dispatchers.Main) {
                    if (att != null) {
                        applyStatusVisuals(att.state, att.verificationStatus, att.flagReason)
                        binding.messageText.text = setSummaryMessage(
                            att.state,
                            statusExtra,
                            att.serverMessage,
                            att.failureReason
                        )
                        binding.detailsText.text = detailsText(att)

                        // Show retry only when it makes sense for the user.
                        binding.retryButton.isVisible = att.state == AttendanceState.FAILED || att.state == AttendanceState.PENDING_LOCAL

                        // Offline banner for queued
                        binding.offlineBanner.isVisible = att.state == AttendanceState.PENDING_LOCAL
                    } else {
                        // Fallback: show retry based on extras
                        binding.retryButton.isVisible = parsedState == AttendanceState.FAILED || parsedState == AttendanceState.PENDING_LOCAL
                        binding.offlineBanner.isVisible = parsedState == AttendanceState.PENDING_LOCAL
                    }
                }
            }
        } else {
            binding.retryButton.isVisible = parsedState == AttendanceState.FAILED || parsedState == AttendanceState.PENDING_LOCAL
            binding.offlineBanner.isVisible = parsedState == AttendanceState.PENDING_LOCAL
        }
    }
}
