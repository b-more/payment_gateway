package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.instacompay.pos.data.SecureCredentialStore

/** Launcher: route to activation (first run) or the sale screen (already paired). */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = SecureCredentialStore(this)
        val target = if (store.isActivated) SaleActivity::class.java else ActivationActivity::class.java
        startActivity(Intent(this, target))
        finish()
    }
}
