package com.hexad.studentapp.net

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

/**
 * Returns true only when the active network is actually usable for internet.
 *
 * Important: Wi‑Fi can be connected but not have internet (or be captive). In that case,
 * we must return false so the app follows the offline flow.
 */
fun Context.hasInternetCapability(): Boolean {
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = cm.activeNetwork ?: return false
    val caps = cm.getNetworkCapabilities(network) ?: return false

    val validated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    return validated
}
