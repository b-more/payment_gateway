package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.data.SecureCredentialStore
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Branded launch screen; routes to the dashboard (paired) or welcome (first run). */
class SplashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)
        val store = SecureCredentialStore(this)
        lifecycleScope.launch {
            delay(1200)
            val next = if (store.isActivated) DashboardActivity::class.java else WelcomeActivity::class.java
            startActivity(Intent(this@SplashActivity, next))
            finish()
        }
    }
}
