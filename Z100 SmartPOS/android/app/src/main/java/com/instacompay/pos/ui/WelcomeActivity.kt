package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.instacompay.pos.databinding.ActivityWelcomeBinding

/** First-run welcome; leads into terminal activation. */
class WelcomeActivity : AppCompatActivity() {
    private lateinit var b: ActivityWelcomeBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityWelcomeBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.activateBtn.setOnClickListener {
            startActivity(Intent(this, ActivationActivity::class.java))
        }
    }
}
