package com.hexad.studentapp

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.GravityCompat
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import com.hexad.studentapp.databinding.ActivitySessionCodeBinding
import com.hexad.studentapp.flow.FlowExtras
import com.hexad.studentapp.net.NodeStudentApi
import com.hexad.studentapp.net.hasInternetCapability
import com.google.firebase.auth.FirebaseAuth
import android.view.MenuItem
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.ActionBarDrawerToggle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class SessionCodeActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySessionCodeBinding
    private lateinit var drawerToggle: ActionBarDrawerToggle

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySessionCodeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Navigation drawer (hamburger)
        drawerToggle = ActionBarDrawerToggle(
            this,
            binding.drawerLayout,
            R.string.drawer_open,
            R.string.drawer_close
        )
        binding.drawerLayout.addDrawerListener(drawerToggle)
        drawerToggle.syncState()
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setHomeButtonEnabled(true)

        // Header profile info
        try {
            val header = binding.navView.getHeaderView(0)
            val tvName = header.findViewById<TextView>(R.id.drawerName)
            val tvEmail = header.findViewById<TextView>(R.id.drawerEmail)
            val user = FirebaseAuth.getInstance().currentUser
            val name = user?.displayName?.takeIf { it.isNotBlank() } ?: "Student"
            val emailOrId = user?.email?.takeIf { it.isNotBlank() } ?: user?.uid ?: ""
            tvName.text = name
            tvEmail.text = emailOrId

            header.setOnClickListener {
                startActivity(Intent(this, ProfileActivity::class.java))
                binding.drawerLayout.closeDrawer(GravityCompat.START)
            }
        } catch (_: Throwable) {
        }

        binding.navView.setNavigationItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_profile -> {
                    startActivity(Intent(this, ProfileActivity::class.java))
                    true
                }

                R.id.nav_history -> {
                    startActivity(Intent(this, AttendanceListActivity::class.java))
                    true
                }

                else -> false
            }.also {
                binding.drawerLayout.closeDrawer(GravityCompat.START)
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.drawerLayout.isDrawerOpen(GravityCompat.START)) {
                    binding.drawerLayout.closeDrawer(GravityCompat.START)
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        binding.profileButton.setOnClickListener {
            startActivity(Intent(this, ProfileActivity::class.java))
        }

        fun setLoading(loading: Boolean, message: String? = null) {
            binding.loadingRow.isVisible = loading
            binding.submitButton.isEnabled = !loading
            binding.profileButton.isEnabled = !loading
            if (!message.isNullOrBlank()) {
                binding.loadingText.text = message
            }
        }

        binding.submitButton.setOnClickListener {
            val code = binding.sessionCodeEditText.text?.toString()?.trim().orEmpty()
            Log.d("SESSION_CODE", "Clicked proceed with code='$code'")

            if (code.isBlank()) {
                Toast.makeText(this, "Enter session code", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val isOnline = applicationContext.hasInternetCapability()
            Log.d("SESSION_CODE", "isOnline=$isOnline")

            // Offline: allow flow (Room will save; sync later)
            if (!isOnline) {
                binding.offlineBanner.isVisible = true
                setLoading(false)
                startActivity(
                    Intent(this, EnvironmentCheckActivity::class.java)
                        .putExtra(FlowExtras.EXTRA_SESSION_CODE, code)
                        .putExtra(FlowExtras.EXTRA_IS_ONLINE, false)
                )
                return@setOnClickListener
            }

            binding.offlineBanner.isVisible = false

            // Online: verify with backend
            setLoading(true, "Validating session…")

            lifecycleScope.launch {
                val result = withContext(Dispatchers.IO) {
                    NodeStudentApi.validateSession(applicationContext, code)
                }

                when (result) {
                    is NodeStudentApi.ApiResult.Success -> {
                        startActivity(
                            Intent(this@SessionCodeActivity, EnvironmentCheckActivity::class.java)
                                .putExtra(FlowExtras.EXTRA_SESSION_CODE, code)
                                .putExtra(FlowExtras.EXTRA_IS_ONLINE, true)
                        )
                    }

                    is NodeStudentApi.ApiResult.HttpError -> {
                        when (result.code) {
                            400 -> {
                                AlertDialog.Builder(this@SessionCodeActivity)
                                    .setTitle("Invalid Session Code")
                                    .setMessage(result.body ?: "Wrong or expired code")
                                    .setPositiveButton("OK", null)
                                    .show()
                            }

                            401 -> {
                                Toast.makeText(this@SessionCodeActivity, "Unauthorized. Please login again.", Toast.LENGTH_LONG).show()
                                startActivity(
                                    Intent(this@SessionCodeActivity, LoginActivity::class.java)
                                        .putExtra(LoginActivity.EXTRA_FORCE_LOGIN, true)
                                )
                                finish()
                                return@launch
                            }

                            else -> {
                                AlertDialog.Builder(this@SessionCodeActivity)
                                    .setTitle("Session Check Failed")
                                    .setMessage(result.body ?: "Server error (${result.code})")
                                    .setPositiveButton("OK", null)
                                    .show()
                            }
                        }
                    }

                    is NodeStudentApi.ApiResult.NetworkError -> {
                        // Network error: allow offline flow
                        binding.offlineBanner.isVisible = true
                        startActivity(
                            Intent(this@SessionCodeActivity, EnvironmentCheckActivity::class.java)
                                .putExtra(FlowExtras.EXTRA_SESSION_CODE, code)
                                .putExtra(FlowExtras.EXTRA_IS_ONLINE, false)
                        )
                    }
                }

                setLoading(false)
            }
        }

        // default state
        binding.offlineBanner.isVisible = false
        setLoading(false)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (drawerToggle.onOptionsItemSelected(item)) return true
        return super.onOptionsItemSelected(item)
    }
}
