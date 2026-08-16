package com.instacompay.pos.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.instacompay.pos.api.ActivationResult

data class StoredCredentials(
    val apiKey: String,
    val secret: String,
    val signingKey: String,
    val deviceId: String,
    val accountNumber: String,
    val environment: String,
)

/**
 * The terminal's device credential at rest, encrypted with a Keystore-backed
 * master key (AES-256). The secret is never logged and only leaves here to be set
 * as an auth header. "Deregister" wipes it (pair with a server-side revoke).
 */
class SecureCredentialStore(context: Context) {
    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "pos_creds",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    val isActivated: Boolean get() = prefs.contains("apiKey")

    fun save(r: ActivationResult) {
        prefs.edit()
            .putString("apiKey", r.apiKey)
            .putString("secret", r.secret)
            .putString("signingKey", r.signingKey)
            .putString("deviceId", r.deviceId)
            .putString("accountNumber", r.accountNumber)
            .putString("environment", r.environment)
            .apply()
    }

    fun load(): StoredCredentials? {
        val apiKey = prefs.getString("apiKey", null) ?: return null
        val secret = prefs.getString("secret", null) ?: return null
        return StoredCredentials(
            apiKey = apiKey,
            secret = secret,
            signingKey = prefs.getString("signingKey", "").orEmpty(),
            deviceId = prefs.getString("deviceId", "").orEmpty(),
            accountNumber = prefs.getString("accountNumber", "").orEmpty(),
            environment = prefs.getString("environment", "SANDBOX").orEmpty(),
        )
    }

    fun clear() { prefs.edit().clear().apply() }
}
