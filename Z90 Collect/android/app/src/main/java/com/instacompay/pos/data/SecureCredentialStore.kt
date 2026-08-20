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
    val merchantName: String,
    val branch: String,
    val environment: String,
    val tradingName: String,
    val address: String,
    val city: String,
    val tpin: String,
    val merchantPhone: String,
    val registrationNumber: String,
) {
    /** Display name for the receipt header: trading name if set, else legal name. */
    val displayName: String get() = tradingName.ifBlank { merchantName }.ifBlank { "InstacomPay" }
}

/**
 * The terminal's device credential + merchant profile at rest, encrypted with a
 * Keystore-backed master key (AES-256). The secret is never logged and only
 * leaves here as an auth header. "Deregister" wipes it (pair with a server revoke).
 */
class SecureCredentialStore(context: Context) {
    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "collect_creds",
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
            .putString("merchantName", r.merchantName)
            .putString("branch", r.branch)
            .putString("environment", r.environment)
            .putString("tradingName", r.tradingName)
            .putString("address", r.address)
            .putString("city", r.city)
            .putString("tpin", r.tpin)
            .putString("merchantPhone", r.merchantPhone)
            .putString("registrationNumber", r.registrationNumber)
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
            merchantName = prefs.getString("merchantName", "").orEmpty(),
            branch = prefs.getString("branch", "").orEmpty(),
            environment = prefs.getString("environment", "SANDBOX").orEmpty(),
            tradingName = prefs.getString("tradingName", "").orEmpty(),
            address = prefs.getString("address", "").orEmpty(),
            city = prefs.getString("city", "").orEmpty(),
            tpin = prefs.getString("tpin", "").orEmpty(),
            merchantPhone = prefs.getString("merchantPhone", "").orEmpty(),
            registrationNumber = prefs.getString("registrationNumber", "").orEmpty(),
        )
    }

    fun clear() { prefs.edit().clear().apply() }
}
