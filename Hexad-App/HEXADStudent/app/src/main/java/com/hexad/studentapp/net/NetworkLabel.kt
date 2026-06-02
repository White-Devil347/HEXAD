package com.hexad.studentapp.net

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.telephony.TelephonyManager

/**
 * Returns a human-readable network label.
 * - Wi-Fi: SSID when available
 * - Mobile: tries to show operator/ISP name via TelephonyManager.networkOperatorName
 */
fun Context.getNetworkLabel(): String {
    return try {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return "No network"
        val caps = cm.getNetworkCapabilities(network) ?: return "No network"

        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val ssid = wifi?.connectionInfo?.ssid?.trim('"')
            if (ssid.isNullOrBlank() || ssid == "<unknown ssid>") "Wi-Fi" else "Wi-Fi: $ssid"
        } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
            val tm = getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            val name = tm?.networkOperatorName?.trim().orEmpty()
            if (name.isBlank()) "Mobile data" else "Mobile: $name"
        } else {
            "Network connected"
        }
    } catch (_: Throwable) {
        "Network"
    }
}
