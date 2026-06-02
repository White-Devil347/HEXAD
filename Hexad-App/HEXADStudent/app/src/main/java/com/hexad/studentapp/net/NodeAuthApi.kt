package com.hexad.studentapp.net

import android.content.Context
import com.hexad.studentapp.BuildConfig
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

object NodeAuthApi {

    private val JSON = "application/json; charset=utf-8".toMediaType()

    /** Best-effort logout event. Must NOT block logout flow. */
    fun logout(context: Context, studentId: String, deviceId: String, reason: String, timestamp: Long): NodeStudentApi.ApiResult {
        val json = JSONObject()
            .put("studentId", studentId)
            .put("deviceId", deviceId)
            .put("reason", reason)
            .put("timestamp", timestamp)
            .toString()

        val req = Request.Builder()
            .url("${BuildConfig.API_BASE_URL}/auth/logout")
            .post(json.toRequestBody(JSON))
            .build()

        return try {
            val client = ApiClient.client(context)
            client.newCall(req).execute().use { res ->
                val body = res.body?.string().orEmpty()
                if (res.isSuccessful) {
                    NodeStudentApi.ApiResult.Success(res.code, body)
                } else {
                    NodeStudentApi.ApiResult.HttpError(res.code, body.ifBlank { null })
                }
            }
        } catch (t: Throwable) {
            NodeStudentApi.ApiResult.NetworkError(t.message)
        }
    }
}

