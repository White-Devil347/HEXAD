package com.hexad.studentapp.flow

object FlowExtras {
    const val EXTRA_SESSION_CODE = "extra_session_code"
    const val EXTRA_IS_ONLINE = "extra_is_online"
    const val EXTRA_LAT = "extra_lat"
    const val EXTRA_LNG = "extra_lng"
    const val EXTRA_INTERNET_OK = "extra_internet_ok"

    // Server-verified environment flags (used to compute canonical verification status)
    const val EXTRA_SSID_VERIFIED = "extra_ssid_verified"
    const val EXTRA_LOCATION_VERIFIED = "extra_location_verified"

    // For confirmation screen display (pure UI; not for validation)
    const val EXTRA_ATTENDANCE_ID = "extra_attendance_id"
    const val EXTRA_NETWORK_TEXT = "extra_network_text"
}
