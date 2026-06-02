package com.hexad.studentapp

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.widget.RadioGroup
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.textfield.TextInputLayout
import com.google.firebase.auth.FirebaseAuth
import com.hexad.studentapp.auth.TokenStore
import com.hexad.studentapp.databinding.ActivityProfileBinding
import com.hexad.studentapp.device.DeviceIdStore
import com.hexad.studentapp.net.NodeAuthApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ProfileActivity : AppCompatActivity() {

    private lateinit var binding: ActivityProfileBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityProfileBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Fade-in
        binding.root.alpha = 0f
        binding.root.animate().alpha(1f).setDuration(180).start()

        val deviceId = DeviceIdStore.getOrCreate(this)
        val masked = deviceId.takeLast(6)
        binding.deviceIdText.text = "Device ID: ******$masked"

        // Basic profile info (FirebaseAuth)
        val user = FirebaseAuth.getInstance().currentUser
        val name = user?.displayName?.takeIf { it.isNotBlank() } ?: "Student"
        val email = user?.email?.takeIf { it.isNotBlank() }
        val uid = user?.uid?.takeIf { it.isNotBlank() }

        binding.profileNameText.text = name
        binding.profileEmailText.text = email ?: "Email: (not available)"
        binding.profileStudentIdText.text = uid?.let { "Student ID: $it" } ?: "Student ID: (not available)"

        binding.logoutButton.setOnClickListener {
            showLogoutDialog(deviceId)
        }
    }

    private fun showLogoutDialog(deviceId: String) {
        val dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_logout_reason, null)
        dialogView.alpha = 0f
        dialogView.animate().alpha(1f).setDuration(160).start()

        val radioGroup = dialogView.findViewById<RadioGroup>(R.id.reasonRadioGroup)
        val otherLayout = dialogView.findViewById<TextInputLayout>(R.id.otherReasonLayout)
        val otherEdit = dialogView.findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.otherReasonEditText)
        val progress = dialogView.findViewById<View>(R.id.progress)

        val dlg = AlertDialog.Builder(this)
            .setTitle("Security Notice")
            .setView(dialogView)
            .setCancelable(false)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Confirm Logout", null)
            .create()

        dlg.setOnShowListener {
            val positive = dlg.getButton(AlertDialog.BUTTON_POSITIVE)
            positive.isEnabled = false

            fun computeValidAndReason(): Pair<Boolean, String?> {
                val checked = radioGroup.checkedRadioButtonId
                if (checked == -1) return false to null

                val isOther = checked == R.id.radioOther
                if (!isOther) {
                    val reason = when (checked) {
                        R.id.radioDeviceChange -> "Device change"
                        R.id.radioAppReinstall -> "App reinstall"
                        R.id.radioTechnicalIssue -> "Technical issue"
                        else -> null
                    }
                    return (reason != null) to reason
                }

                val txt = otherEdit.text?.toString()?.trim().orEmpty()
                return (txt.length >= 5) to txt
            }

            fun refreshUi() {
                val checked = radioGroup.checkedRadioButtonId
                val isOther = checked == R.id.radioOther
                otherLayout.visibility = if (isOther) View.VISIBLE else View.GONE

                val (ok, _) = computeValidAndReason()
                positive.isEnabled = ok && progress.visibility != View.VISIBLE

                if (isOther) {
                    val txt = otherEdit.text?.toString()?.trim().orEmpty()
                    otherLayout.error = if (txt.isNotBlank() && txt.length < 5) "Min 5 chars" else null
                } else {
                    otherLayout.error = null
                }
            }

            radioGroup.setOnCheckedChangeListener { _, _ -> refreshUi() }
            otherEdit.addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                override fun afterTextChanged(s: Editable?) { refreshUi() }
            })

            positive.setOnClickListener {
                val (ok, reason) = computeValidAndReason()
                if (!ok || reason.isNullOrBlank()) {
                    Toast.makeText(this, "Select a reason", Toast.LENGTH_SHORT).show()
                    refreshUi()
                    return@setOnClickListener
                }

                // UI busy
                progress.visibility = View.VISIBLE
                positive.isEnabled = false

                performLogout(deviceId = deviceId, reason = reason) {
                    dlg.dismiss()
                }
            }

            refreshUi()
        }

        dlg.show()
    }

    private fun performLogout(deviceId: String, reason: String, done: () -> Unit) {
        val user = FirebaseAuth.getInstance().currentUser
        val studentId = user?.uid.orEmpty()
        val timestamp = System.currentTimeMillis()

        // Best-effort backend log (must not block signout)
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                try {
                    if (studentId.isNotBlank()) {
                        NodeAuthApi.logout(
                            context = this@ProfileActivity,
                            studentId = studentId,
                            deviceId = deviceId,
                            reason = reason,
                            timestamp = timestamp
                        )
                    }
                } catch (_: Throwable) {
                }
            }

            try {
                TokenStore.clear(this@ProfileActivity)
            } catch (_: Throwable) {
            }
            try {
                FirebaseAuth.getInstance().signOut()
            } catch (_: Throwable) {
            }

            done()

            // Go to login, clear stack
            val i = Intent(this@ProfileActivity, LoginActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            startActivity(i)
            finish()
        }
    }
}

