package com.hexad.studentapp

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.FirebaseAuth
import com.hexad.studentapp.auth.TokenStore
import com.hexad.studentapp.databinding.ActivityLoginBinding
import com.hexad.studentapp.net.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request

class LoginActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLoginBinding

    private enum class BackendCheck {
        OK,
        UNAUTHORIZED,
        SERVER_ERROR,
        NETWORK_ERROR
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val forceLogin = intent.getBooleanExtra(EXTRA_FORCE_LOGIN, false)

        // Auto-login if we still have a token + FirebaseAuth session.
        // This prevents forcing the user to re-enter credentials after app restarts.
        val existingToken = TokenStore.get(this)
        val existingUser = FirebaseAuth.getInstance().currentUser
        if (!forceLogin && !existingToken.isNullOrBlank() && existingUser != null) {
            // Prevent duplicate taps while we check.
            binding.loginButton.isEnabled = false
            verifyBackendThenProceed(allowProceedOnNetworkFailure = true)
            return
        }

        binding.loginButton.setOnClickListener {
            val email = binding.usernameEditText.text?.toString()?.trim().orEmpty()
            val password = binding.passwordEditText.text?.toString().orEmpty()

            if (email.isBlank() || password.isBlank()) {
                Toast.makeText(this, "Enter email & password", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            binding.loginButton.isEnabled = false

            FirebaseAuth.getInstance()
                .signInWithEmailAndPassword(email, password)
                .addOnSuccessListener { authRes ->
                    val user = authRes.user
                    if (user == null) {
                        binding.loginButton.isEnabled = true
                        Toast.makeText(this, "Login failed (no user)", Toast.LENGTH_SHORT).show()
                        return@addOnSuccessListener
                    }

                    user.getIdToken(true)
                        .addOnSuccessListener { tokenRes ->
                            val token = tokenRes.token
                            if (token.isNullOrBlank()) {
                                binding.loginButton.isEnabled = true
                                Toast.makeText(this, "Login failed (no token)", Toast.LENGTH_SHORT).show()
                                return@addOnSuccessListener
                            }

                            TokenStore.save(this, token)

                            // Verify backend: GET /api/auth/me
                            verifyBackendThenProceed(allowProceedOnNetworkFailure = true)
                        }
                        .addOnFailureListener { e ->
                            binding.loginButton.isEnabled = true
                            Toast.makeText(this, "Token error: ${e.message}", Toast.LENGTH_LONG).show()
                        }
                }
                .addOnFailureListener { e ->
                    binding.loginButton.isEnabled = true
                    Toast.makeText(this, "Login failed: ${e.message}", Toast.LENGTH_LONG).show()
                }
        }

        binding.registerLink.setOnClickListener {
            startActivity(Intent(this, RegisterActivity::class.java))
        }
    }

    private fun verifyBackendThenProceed(allowProceedOnNetworkFailure: Boolean) {
        lifecycleScope.launch {
            val check = withContext(Dispatchers.IO) {
                try {
                    val url = "${BuildConfig.API_BASE_URL}/auth/me"
                    val req = Request.Builder().url(url).get().build()
                    val client = ApiClient.client(this@LoginActivity)
                    client.newCall(req).execute().use { res ->
                        // Read body once; don't log in production.
                        res.body?.string().orEmpty()
                        when {
                            res.isSuccessful -> BackendCheck.OK
                            res.code == 401 -> {
                                BackendCheck.UNAUTHORIZED
                            }
                            else -> BackendCheck.SERVER_ERROR
                        }
                    }
                } catch (_: Exception) {
                    BackendCheck.NETWORK_ERROR
                }
            }

            when (check) {
                BackendCheck.OK -> {
                    Toast.makeText(this@LoginActivity, "Login successful", Toast.LENGTH_SHORT).show()
                    startActivity(Intent(this@LoginActivity, SessionCodeActivity::class.java))
                    finish()
                }
                BackendCheck.UNAUTHORIZED -> {
                    binding.loginButton.isEnabled = true
                    Toast.makeText(this@LoginActivity, "Session expired. Please login again.", Toast.LENGTH_LONG).show()
                }
                BackendCheck.SERVER_ERROR,
                BackendCheck.NETWORK_ERROR -> {
                    if (allowProceedOnNetworkFailure) {
                        Toast.makeText(this@LoginActivity, "Continuing (server unavailable)", Toast.LENGTH_LONG).show()
                        startActivity(Intent(this@LoginActivity, SessionCodeActivity::class.java))
                        finish()
                    } else {
                        binding.loginButton.isEnabled = true
                        Toast.makeText(this@LoginActivity, "Server unavailable", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    companion object {
        const val EXTRA_FORCE_LOGIN = "extra_force_login"
    }
}
