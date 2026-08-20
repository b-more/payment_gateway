package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivitySplashBinding

/** Brief branded splash, then route: activated → Collect, else → Welcome. */
class SplashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val b = ActivitySplashBinding.inflate(layoutInflater)
        setContentView(b.root)

        Handler(Looper.getMainLooper()).postDelayed({
            val activated = SecureCredentialStore(this).isActivated
            startActivity(Intent(this, if (activated) DashboardActivity::class.java else WelcomeActivity::class.java))
            finish()
        }, 1200)
    }
}
