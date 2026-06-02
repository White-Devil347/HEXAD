package com.hexad.studentapp.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat

data class GeoFence(val centerLat: Double, val centerLng: Double, val radiusMeters: Double)

// Campus geofence centered at user-provided coordinates
val CAMPUS_GEOFENCE = GeoFence(
    centerLat = 19.168786,
    centerLng = 72.838301,
    radiusMeters = 1000.0 // 1km radius around the provided location for easier testing
)

fun Context.hasLocationPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

fun isInsideGeofence(location: Location, geofence: GeoFence = CAMPUS_GEOFENCE): Boolean {
    val result = FloatArray(1)
    Location.distanceBetween(
        geofence.centerLat,
        geofence.centerLng,
        location.latitude,
        location.longitude,
        result
    )
    return result[0] <= geofence.radiusMeters
}
