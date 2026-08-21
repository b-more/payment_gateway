package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.api.ApiException
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivityActivationBinding
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** Enter the one-time activation code → issue + store the device credential. */
class ActivationActivity : AppCompatActivity() {
    private lateinit var b: ActivityActivationBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityActivationBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.backBtn.setOnClickListener { finish() }
        b.activateBtn.setOnClickListener { activate() }
    }

    private fun activate() {
        val code = b.codeInput.text.toString().trim()
        if (code.isEmpty()) { setStatus("Enter the activation code", true); return }
        b.activateBtn.isEnabled = false
        setStatus("Activating…", false)
        lifecycleScope.launch {
            try {
                // The serial is optional server-side, and reading it needs the ZCS SDK to
                // be initialised — which powers on the secure module and can take many
                // seconds on the Z90. Don't hold up activation for it: give it a short
                // budget, and proceed with an empty serial if the SDK isn't ready yet
                // (it keeps initialising in the background for printing).
                val serial = withTimeoutOrNull(2500) {
                    runCatching {
                        SdkManager.onHardware { if (SdkManager.init()) SdkManager.serialNumber() else "" }
                    }.getOrNull()
                } ?: ""
                val result = api.activate(code, serial)
                store.save(result)
                startActivity(Intent(this@ActivationActivity, DashboardActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
                finish()
            } catch (e: ApiException) {
                setStatus(e.message ?: "Activation failed", true)
                b.activateBtn.isEnabled = true
            } catch (e: Exception) {
                setStatus("Error: ${e.message}", true)
                b.activateBtn.isEnabled = true
            }
        }
    }

    private fun setStatus(msg: String, error: Boolean) {
        b.status.text = msg
        b.status.setTextColor(ContextCompat.getColor(this, if (error) R.color.accent else R.color.slate))
    }
}
