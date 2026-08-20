package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.instacompay.pos.databinding.ActivityWelcomeBinding

/** First-run welcome: brand, one line about what this terminal does, Activate. */
class WelcomeActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val b = ActivityWelcomeBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.activateBtn.setOnClickListener {
            startActivity(Intent(this, ActivationActivity::class.java))
        }
    }
}
