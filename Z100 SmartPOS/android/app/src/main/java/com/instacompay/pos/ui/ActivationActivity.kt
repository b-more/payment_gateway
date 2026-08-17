package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.api.ApiException
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivityActivationBinding
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** First-run pairing: enter the one-time code from the merchant portal. */
class ActivationActivity : AppCompatActivity() {
    private lateinit var b: ActivityActivationBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityActivationBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.activateBtn.setOnClickListener { activate() }
    }

    private fun activate() {
        val code = b.codeInput.text.toString().trim()
        if (code.isEmpty()) {
            Toast.makeText(this, "Enter the activation code", Toast.LENGTH_SHORT).show()
            return
        }
        b.activateBtn.isEnabled = false
        b.status.text = "Activating…"
        lifecycleScope.launch {
            try {
                val serial = withContext(Dispatchers.IO) { SdkManager.serialNumber() }
                val result = api.activate(code, serial)
                store.save(result)
                startActivity(
                    Intent(this@ActivationActivity, DashboardActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
                )
                finish()
            } catch (e: ApiException) {
                b.status.text = e.message
                b.activateBtn.isEnabled = true
            } catch (e: Exception) {
                b.status.text = "Network error: ${e.message}"
                b.activateBtn.isEnabled = true
            }
        }
    }
}
