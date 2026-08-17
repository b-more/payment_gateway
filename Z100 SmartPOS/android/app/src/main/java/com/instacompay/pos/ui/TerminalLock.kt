package com.instacompay.pos.ui

import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import com.instacompay.pos.api.ApiException
import com.instacompay.pos.data.SecureCredentialStore

/**
 * If [e] is an auth failure (HTTP 401 — the terminal's credential was revoked or
 * is invalid), wipe the stored credential and lock the app back to the welcome /
 * activation screen. Returns true when it handled the lock, so callers can stop.
 */
fun AppCompatActivity.lockIfRevoked(e: Throwable): Boolean {
    if (e is ApiException && e.statusCode == 401) {
        SecureCredentialStore(this).clear()
        startActivity(
            Intent(this, WelcomeActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        )
        finish()
        return true
    }
    return false
}
