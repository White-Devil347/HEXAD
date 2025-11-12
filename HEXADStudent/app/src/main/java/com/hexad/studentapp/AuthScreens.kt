package com.hexad.studentapp

import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.AndroidViewModel
import kotlinx.coroutines.launch

class SimpleAuthViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("auth", Context.MODE_PRIVATE)

    fun register(username: String, password: String): Result<Unit> {
        if (username.isBlank() || password.length < 4) return Result.failure(IllegalArgumentException("Invalid"))
        val key = "user_$username"
        return if (!prefs.contains(key)) {
            prefs.edit { putString(key, password) }
            Result.success(Unit)
        } else Result.failure(IllegalStateException("Exists"))
    }

    fun login(username: String, password: String): Result<Unit> {
        val key = "user_$username"
        val stored = prefs.getString(key, null)
        return if (stored != null && stored == password) Result.success(Unit) else Result.failure(IllegalArgumentException("Bad creds"))
    }
}

@Composable
fun LoginScreen(vm: SimpleAuthViewModel, onRegisterClick: () -> Unit, onLoginSuccess: () -> Unit) {
    val username = remember { mutableStateOf("") }
    val pass = remember { mutableStateOf("") }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Login")
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = username.value, onValueChange = { username.value = it }, label = { Text("Username") })
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = pass.value, onValueChange = { pass.value = it }, label = { Text("Password") }, visualTransformation = PasswordVisualTransformation())
            Spacer(Modifier.height(12.dp))
            Button(onClick = {
                val res = vm.login(username.value.trim(), pass.value)
                if (res.isSuccess) onLoginSuccess() else scope.launch { snackbar.showSnackbar("Invalid credentials") }
            }) { Text("Login") }
            Spacer(Modifier.height(8.dp))
            Button(onClick = onRegisterClick) { Text("Go to Register") }
        }
    }
}

@Composable
fun RegisterScreen(vm: SimpleAuthViewModel, onRegisterSuccess: () -> Unit, onBack: () -> Unit) {
    val username = remember { mutableStateOf("") }
    val pass = remember { mutableStateOf("") }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Register")
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = username.value, onValueChange = { username.value = it }, label = { Text("Username") })
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = pass.value, onValueChange = { pass.value = it }, label = { Text("Password (min 4)") }, visualTransformation = PasswordVisualTransformation())
            Spacer(Modifier.height(12.dp))
            Button(onClick = {
                val res = vm.register(username.value.trim(), pass.value)
                if (res.isSuccess) onRegisterSuccess() else scope.launch { snackbar.showSnackbar("User exists or invalid") }
            }) { Text("Create Account") }
            Spacer(Modifier.height(8.dp))
            Button(onClick = onBack) { Text("Back") }
        }
    }
}

@Composable
fun HomeScreen(onLogout: () -> Unit) {
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Home")
            Spacer(Modifier.height(12.dp))
            Button(onClick = {
                // Biometric flow
                val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
                val biometricManager = BiometricManager.from(context)
                when (biometricManager.canAuthenticate(authenticators)) {
                    BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            val enrollIntent = Intent(Settings.ACTION_BIOMETRIC_ENROLL).putExtra(
                                Settings.EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED, authenticators
                            )
                            context.startActivity(enrollIntent)
                        } else {
                            scope.launch { snackbar.showSnackbar("No biometrics enrolled - set device lock or enroll") }
                        }
                    }
                    BiometricManager.BIOMETRIC_SUCCESS -> {
                        val activity = (context as? FragmentActivity)
                        val executor = ContextCompat.getMainExecutor(context)
                        val callback = object : BiometricPrompt.AuthenticationCallback() {
                            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                                super.onAuthenticationError(errorCode, errString)
                                scope.launch { snackbar.showSnackbar("Error: ${'$'}errString") }
                            }

                            override fun onAuthenticationFailed() {
                                super.onAuthenticationFailed()
                                scope.launch { snackbar.showSnackbar("Not recognized") }
                            }

                            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                                super.onAuthenticationSucceeded(result)
                                scope.launch { snackbar.showSnackbar("Attendance marked") }
                            }
                        }

                        if (activity == null) {
                            scope.launch { snackbar.showSnackbar("Activity not available for biometric prompt") }
                            return@Button
                        }

                        val prompt = BiometricPrompt(activity, executor, callback)
                        val promptInfoBuilder = BiometricPrompt.PromptInfo.Builder()
                            .setTitle("Verify")
                            .setSubtitle("Use fingerprint or device credential")

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            promptInfoBuilder.setAllowedAuthenticators(authenticators)
                        } else {
                            @Suppress("DEPRECATION")
                            promptInfoBuilder.setDeviceCredentialAllowed(true)
                        }

                        prompt.authenticate(promptInfoBuilder.build())
                    }
                    else -> {
                        scope.launch { snackbar.showSnackbar("Biometric unavailable") }
                    }
                }
            }) { Text("Mark Attendance") }

            Spacer(Modifier.height(12.dp))
            Button(onClick = onLogout) { Text("Logout") }
        }
    }
}
