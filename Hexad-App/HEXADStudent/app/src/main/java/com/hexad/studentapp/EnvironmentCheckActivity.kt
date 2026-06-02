package com.hexad.studentapp

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.IntentSender
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.common.api.ResolvableApiException
import com.google.android.gms.location.Granularity
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.LocationSettingsRequest
import com.google.android.gms.location.Priority
import com.hexad.studentapp.databinding.ActivityEnvironmentCheckBinding
import com.hexad.studentapp.flow.FlowExtras
import com.hexad.studentapp.net.getNetworkLabel
import com.hexad.studentapp.net.hasInternetCapability
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class EnvironmentCheckActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEnvironmentCheckBinding
    private val fusedLocationClient by lazy { LocationServices.getFusedLocationProviderClient(this) }

    private var lastLocation: Location? = null
    private var lastInternetOk: Boolean = false

    private var ssidVerified: Boolean = false
    private var locationVerified: Boolean = false

    private var sessionCode: String = ""
    private var isOnlineFlow: Boolean = false

    private val REQUEST_CHECK_SETTINGS = 1001

    // GPS fix timeout (offline GPS can be slow)
    private val GPS_TIMEOUT_MS = 25_000L

    private var gpsCountdownJob: Job? = null

    private fun hasLocationPermission(): Boolean {
        val fine = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    private fun getLastKnownLocationFast(onResult: (Location?) -> Unit) {
        if (!hasLocationPermission()) {
            onResult(null)
            return
        }
        try {
            fusedLocationClient.lastLocation
                .addOnSuccessListener { onResult(it) }
                .addOnFailureListener { onResult(null) }
        } catch (_: SecurityException) {
            onResult(null)
        } catch (_: Throwable) {
            onResult(null)
        }
    }

    /** Device Location toggle (not just GPS provider). */
    private fun isLocationEnabled(): Boolean {
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager
        return try {
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        } catch (_: Throwable) {
            false
        }
    }

    /** Prompt the system dialog to enable Location services. If already enabled, runs onEnabled. */
    private fun promptEnableLocation(onEnabled: () -> Unit) {
        if (isLocationEnabled()) {
            onEnabled()
            return
        }

        binding.locationStatusText.text = "Location is OFF. Please enable Location."

        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
            .setGranularity(Granularity.GRANULARITY_FINE)
            .setWaitForAccurateLocation(true)
            .build()

        val builder = LocationSettingsRequest.Builder()
            .addLocationRequest(locationRequest)
            .setAlwaysShow(true)

        LocationServices.getSettingsClient(this)
            .checkLocationSettings(builder.build())
            .addOnSuccessListener { onEnabled() }
            .addOnFailureListener { exception ->
                if (exception is ResolvableApiException) {
                    try {
                        exception.startResolutionForResult(this@EnvironmentCheckActivity, REQUEST_CHECK_SETTINGS)
                    } catch (_: IntentSender.SendIntentException) {
                        binding.locationStatusText.text = "Could not open Location settings"
                        // online blocks, offline allows
                        binding.proceedButton.isEnabled = !lastInternetOk
                    }
                } else {
                    binding.locationStatusText.text = "Location settings unavailable"
                    binding.proceedButton.isEnabled = !lastInternetOk
                }
            }
    }

    private fun startLiveFetch() {
        // Always update network label (SSID/ISP)
        val netLabel = applicationContext.getNetworkLabel()
        binding.wifiStatusText.text = "Network: $netLabel"

        lastInternetOk = isInternetAvailableAnyTransport()
        ssidVerified = lastInternetOk

        // If device Location is OFF, prompt to enable it instead of saying 'try again'
        promptEnableLocation {
            if (lastInternetOk) {
                binding.proceedButton.isEnabled = false
                binding.locationStatusText.text = "Location: fetching..."
                fetchOnlineLocationRequired()
            } else {
                // OFFLINE: last-known quick, then GPS-only
                binding.proceedButton.isEnabled = false
                binding.locationStatusText.text = "Location: fetching (offline)..."
                getLastKnownLocationFast { loc ->
                    if (loc != null) {
                        lastLocation = loc
                        locationVerified = true
                        binding.locationStatusText.text = "Location: ${loc.latitude}, ${loc.longitude}"
                        binding.proceedButton.isEnabled = true
                        binding.checkButton.isEnabled = true
                    } else {
                        // If no cached location, then do GPS-only with countdown
                        ensureLocationEnabledThenFetchGps()
                    }
                }
            }
        }
    }

    private val locationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            val granted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true || results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            if (!granted) {
                Toast.makeText(this, "Location permission is required", Toast.LENGTH_SHORT).show()
                binding.locationStatusText.text = "Location: permission denied"
                // Online: block. Offline: still can proceed.
                binding.proceedButton.isEnabled = !lastInternetOk
                binding.checkButton.isEnabled = true
                return@registerForActivityResult
            }
            startLiveFetch()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEnvironmentCheckBinding.inflate(layoutInflater)
        setContentView(binding.root)

        sessionCode = intent.getStringExtra(FlowExtras.EXTRA_SESSION_CODE).orEmpty()
        isOnlineFlow = intent.getBooleanExtra(FlowExtras.EXTRA_IS_ONLINE, false)

        // Button label back to original
        binding.checkButton.text = "Fetch configuration"
        binding.proceedButton.text = "Proceed to Biometric"
        binding.proceedButton.isEnabled = false

        binding.checkButton.setOnClickListener {
            // recompute online state each click
            lastInternetOk = isInternetAvailableAnyTransport()

            if (!hasLocationPermission()) {
                locationPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    )
                )
                return@setOnClickListener
            }

            startLiveFetch()
        }

        binding.proceedButton.setOnClickListener {
            val loc = lastLocation
            val i = Intent(this, FingerprintActivity::class.java)
                .putExtra(FlowExtras.EXTRA_SESSION_CODE, sessionCode)
                .putExtra(FlowExtras.EXTRA_IS_ONLINE, isOnlineFlow)
                .putExtra(FlowExtras.EXTRA_INTERNET_OK, lastInternetOk)
                .putExtra(FlowExtras.EXTRA_SSID_VERIFIED, ssidVerified)
                .putExtra(FlowExtras.EXTRA_LOCATION_VERIFIED, locationVerified)

            if (loc != null) {
                i.putExtra(FlowExtras.EXTRA_LAT, loc.latitude)
                i.putExtra(FlowExtras.EXTRA_LNG, loc.longitude)
            }

            startActivity(i)
        }

        binding.wifiStatusText.text = if (isOnlineFlow) "Network: online" else "Network: offline"
        binding.locationStatusText.text = "Location: not checked"
    }

    private fun isInternetAvailableAnyTransport(): Boolean {
        return applicationContext.hasInternetCapability()
    }

    private fun isGpsEnabled(): Boolean {
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
    }

    private fun ensureLocationEnabledThenFetchGps() {
        if (!isGpsEnabled()) {
            binding.locationStatusText.text = "GPS is off. Please enable Location (GPS)."
            // Try to prompt user via settings dialog
            val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
                .setGranularity(Granularity.GRANULARITY_FINE)
                .setWaitForAccurateLocation(true)
                .build()

            val builder = LocationSettingsRequest.Builder()
                .addLocationRequest(locationRequest)
                .setAlwaysShow(true)

            LocationServices.getSettingsClient(this)
                .checkLocationSettings(builder.build())
                .addOnSuccessListener { fetchGpsLocationWithTimeout() }
                .addOnFailureListener { exception ->
                    if (exception is ResolvableApiException) {
                        try {
                            exception.startResolutionForResult(this@EnvironmentCheckActivity, REQUEST_CHECK_SETTINGS)
                        } catch (_: IntentSender.SendIntentException) {
                            binding.locationStatusText.text = "GPS enable failed"
                        }
                    } else {
                        binding.locationStatusText.text = "GPS not available"
                    }
                }
            return
        }

        fetchGpsLocationWithTimeout()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_CHECK_SETTINGS) {
            if (resultCode == Activity.RESULT_OK) {
                // User enabled Location. Continue with fetch.
                startLiveFetch()
            } else {
                binding.locationStatusText.text = "Location is still OFF"
                // online blocks, offline allows
                binding.proceedButton.isEnabled = !lastInternetOk
            }
        }
    }

    private fun fetchOnlineLocationRequired() {
        if (!hasLocationPermission()) {
            binding.locationStatusText.text = "Location: permission required"
            binding.proceedButton.isEnabled = false
            binding.checkButton.isEnabled = true
            return
        }

        gpsCountdownJob?.cancel()

        binding.checkButton.isEnabled = false
        locationVerified = false
        lastLocation = null

        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
            .setGranularity(Granularity.GRANULARITY_FINE)
            .setWaitForAccurateLocation(true)
            .build()

        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc = result.lastLocation ?: return

                lastLocation = loc
                locationVerified = true
                fusedLocationClient.removeLocationUpdates(this)

                binding.locationStatusText.text = "Location: ${loc.latitude}, ${loc.longitude}"
                binding.checkButton.isEnabled = true
                // Online: now allow proceed
                binding.proceedButton.isEnabled = true
            }
        }

        try {
            fusedLocationClient.requestLocationUpdates(req, cb, Looper.getMainLooper())
        } catch (_: SecurityException) {
            binding.locationStatusText.text = "Location: permission denied"
            binding.checkButton.isEnabled = true
            binding.proceedButton.isEnabled = false
            return
        } catch (_: Throwable) {
            binding.locationStatusText.text = "Location: error"
            binding.checkButton.isEnabled = true
            binding.proceedButton.isEnabled = false
            return
        }

        // Online: no timeout message spam. If it doesn't arrive, user can tap again.
        lifecycleScope.launch {
            delay(12_000)
            if (lastLocation == null) {
                try {
                    fusedLocationClient.removeLocationUpdates(cb)
                } catch (_: Exception) {
                }
                binding.locationStatusText.text = "Location: unavailable (try again)"
                binding.checkButton.isEnabled = true
                binding.proceedButton.isEnabled = false
                locationVerified = false
            }
        }
    }

    /**
     * GPS-only fetch:
     * - High accuracy
     * - Wait for accurate location
     * - No lastLocation usage
     * - Timeout after GPS_TIMEOUT_MS
     */
    private fun fetchGpsLocationWithTimeout() {
        if (!hasLocationPermission()) {
            binding.locationStatusText.text = "Location: permission required"
            binding.checkButton.isEnabled = true
            // offline: allow proceed
            binding.proceedButton.isEnabled = true
            return
        }

        // Offline-only GPS-only fetch: show wait message + visible timeout countdown
        gpsCountdownJob?.cancel()

        binding.checkButton.isEnabled = false
        binding.proceedButton.isEnabled = false

        lastLocation = null
        locationVerified = false

        val timeoutSeconds = (GPS_TIMEOUT_MS / 1000).toInt()
        gpsCountdownJob = lifecycleScope.launch {
            for (remaining in timeoutSeconds downTo 0) {
                binding.locationStatusText.text = "Fetching GPS location… Internet not required. Timeout in ${remaining}s"
                delay(1_000)
            }
        }

        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
            .setGranularity(Granularity.GRANULARITY_FINE)
            .setWaitForAccurateLocation(true)
            .build()

        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc = result.lastLocation ?: return
                lastLocation = loc
                locationVerified = true

                gpsCountdownJob?.cancel()
                fusedLocationClient.removeLocationUpdates(this)

                // Show live coordinates
                binding.locationStatusText.text = "Location: ${loc.latitude}, ${loc.longitude}"
                binding.proceedButton.isEnabled = true
                binding.checkButton.isEnabled = true
            }
        }

        try {
            fusedLocationClient.requestLocationUpdates(req, cb, Looper.getMainLooper())
        } catch (_: SecurityException) {
            gpsCountdownJob?.cancel()
            binding.locationStatusText.text = "Location: permission denied"
            binding.checkButton.isEnabled = true
            binding.proceedButton.isEnabled = true
            return
        } catch (_: Throwable) {
            gpsCountdownJob?.cancel()
            binding.locationStatusText.text = "Location: error"
            binding.checkButton.isEnabled = true
            binding.proceedButton.isEnabled = true
            return
        }

        lifecycleScope.launch {
            delay(GPS_TIMEOUT_MS)
            if (lastLocation == null) {
                try {
                    fusedLocationClient.removeLocationUpdates(cb)
                } catch (_: Exception) {
                }
                gpsCountdownJob?.cancel()
                binding.locationStatusText.text = "GPS timeout. Proceeding offline."
                binding.checkButton.isEnabled = true
                binding.proceedButton.isEnabled = true
                locationVerified = false
            }
        }
    }
}
