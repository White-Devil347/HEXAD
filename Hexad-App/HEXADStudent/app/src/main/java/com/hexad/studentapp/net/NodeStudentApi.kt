package com.hexad.studentapp.net

import android.content.Context
import com.hexad.studentapp.BuildConfig
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

object NodeStudentApi {

    sealed class ApiResult {
        data class Success(val code: Int, val body: String) : ApiResult()
        data class HttpError(val code: Int, val body: String?) : ApiResult()
        data class NetworkError(val message: String?) : ApiResult()
    }

    /** Parsed submit-attendance response (best-effort). */
    data class SubmitAttendanceParsed(
        val verificationStatus: String?,
        val flag: String?,
        val message: String?
    )

    private val JSON = "application/json; charset=utf-8".toMediaType()

    fun validateSession(context: Context, sessionCode: String): ApiResult {
        val json = JSONObject()
            .put("sessionCode", sessionCode)
            .toString()

        val req = Request.Builder()
            .url("${BuildConfig.API_BASE_URL}/student/validate-code")
            .post(json.toRequestBody(JSON))
            .build()

        return execute(context, req)
    }

    fun submitAttendance(
        context: Context,
        sessionCode: String,
        timestamp: Long,
        ssid: String?,
        latitude: Double?,
        longitude: Double?,
        studentId: String
    ): ApiResult {
        val json = JSONObject()
            .put("studentId", studentId)
            .put("sessionCode", sessionCode)
            .put("timestamp", timestamp)
            .put("ssid", ssid)
            .put("latitude", latitude)
            .put("longitude", longitude)
            .toString()

        val req = Request.Builder()
            .url("${BuildConfig.API_BASE_URL}/student/submit-attendance")
            .post(json.toRequestBody(JSON))
            .build()

        return execute(context, req)
    }

    fun parseSubmitAttendance(body: String?): SubmitAttendanceParsed {
        if (body.isNullOrBlank()) return SubmitAttendanceParsed(null, null, null)
        return try {
            val o = JSONObject(body)
            fun optNullable(key: String): String? = o.optString(key).takeIf { it.isNotBlank() }

            SubmitAttendanceParsed(
                verificationStatus = optNullable("verification_status"),
                flag = optNullable("flag"),
                message = optNullable("message")
            )
        } catch (_: Throwable) {
            SubmitAttendanceParsed(null, null, body)
        }
    }

    private fun execute(context: Context, request: Request): ApiResult {
        return try {
            val client = ApiClient.client(context)
            client.newCall(request).execute().use { res ->
                val body = res.body?.string().orEmpty()
                if (res.isSuccessful) {
                    ApiResult.Success(res.code, body)
                } else {
                    ApiResult.HttpError(res.code, body.ifBlank { null })
                }
            }
        } catch (t: Throwable) {
            ApiResult.NetworkError(t.message)
        }
    }
}
