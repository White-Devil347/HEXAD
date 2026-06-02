package com.hexad.studentapp.net

import android.content.Context
import android.util.Log
import com.hexad.studentapp.BuildConfig
import com.hexad.studentapp.auth.TokenStore
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import java.io.IOException
import java.util.concurrent.TimeUnit

object ApiClient {

    private const val TAG = "OKHTTP"

    @Volatile
    private var cached: OkHttpClient? = null

    /**
     * OkHttp client that automatically attaches:
     * Authorization: Bearer <Firebase ID token>
     *
     * Also attempts to refresh the token automatically on 401.
     */
    fun client(context: Context): OkHttpClient {
        val existing = cached
        if (existing != null) return existing

        val appCtx = context.applicationContext

        val builder = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            // Attach token
            .addInterceptor(AuthHeaderInterceptor(appCtx))
            // Refresh token on 401 (prevents frequent forced re-login when tokens expire)
            .authenticator(FirebaseTokenRefreshAuthenticator(appCtx))

        if (BuildConfig.HTTP_LOGGING) {
            val httpLogger = HttpLoggingInterceptor { msg ->
                Log.d(TAG, msg)
            }.apply {
                level = HttpLoggingInterceptor.Level.BASIC
            }

            // Log URL + exceptions early (debug only)
            builder.addInterceptor(ConnectivityLoggingInterceptor())
            // OkHttp built-in basic logs: URL + response code
            builder.addInterceptor(httpLogger)
        }

        val created = builder.build()

        cached = created
        return created
    }

    private class ConnectivityLoggingInterceptor : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val req = chain.request()
            Log.d(TAG, "--> ${req.method} ${req.url}")
            return try {
                val res = chain.proceed(req)
                Log.d(TAG, "<-- ${res.code} ${req.url}")
                res
            } catch (e: IOException) {
                Log.e(TAG, "HTTP FAILED for ${req.url}: ${e.javaClass.simpleName}: ${e.message}", e)
                throw e
            }
        }
    }

    private class AuthHeaderInterceptor(private val context: Context) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val token = TokenStore.get(context)
            val req = if (!token.isNullOrBlank()) {
                chain.request().newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            } else {
                chain.request()
            }
            return chain.proceed(req)
        }
    }

    /**
     * OkHttp Authenticator: when backend returns 401, attempt to refresh the Firebase ID token
     * using the persisted FirebaseAuth session, then retry the request once.
     */
    private class FirebaseTokenRefreshAuthenticator(private val context: Context) : Authenticator {

        private val refreshLock = Any()

        override fun authenticate(route: Route?, response: Response): Request? {
            // Avoid infinite loops.
            if (responseCount(response) >= 2) return null

            val storedToken = TokenStore.get(context)
            val requestToken = response.request.header("Authorization")
                ?.removePrefix("Bearer")
                ?.trim()

            // If another request already refreshed the token, just retry with the latest token.
            if (!storedToken.isNullOrBlank() && storedToken != requestToken) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer $storedToken")
                    .build()
            }

            val user = FirebaseAuth.getInstance().currentUser ?: return null

            val newToken = synchronized(refreshLock) {
                // Double-check inside lock in case token was refreshed while waiting.
                val latest = TokenStore.get(context)
                if (!latest.isNullOrBlank() && latest != requestToken) {
                    latest
                } else {
                    runBlocking {
                        try {
                            user.getIdToken(true).await().token
                        } catch (_: Throwable) {
                            null
                        }
                    }?.also { TokenStore.save(context, it) }
                }
            }

            if (newToken.isNullOrBlank()) return null

            return response.request.newBuilder()
                .header("Authorization", "Bearer $newToken")
                .build()
        }

        private fun responseCount(response: Response): Int {
            var r: Response? = response
            var count = 1
            while (r?.priorResponse != null) {
                count++
                r = r.priorResponse
            }
            return count
        }
    }
}
