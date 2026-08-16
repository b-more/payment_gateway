package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.addTextChangedListener
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.databinding.ActivityScanBinding
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.launch

/**
 * Scan-to-pay. The Z100 scanner injects the decoded value as HID keyboard input,
 * so we host a focused (hidden) EditText and read its committed value — there is
 * no decode callback in the SDK.
 */
class ScanActivity : AppCompatActivity() {
    private lateinit var b: ActivityScanBinding
    private var done = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityScanBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.hiddenInput.requestFocus()
        b.hiddenInput.setOnEditorActionListener { _, _, _ -> submit(); true }
        b.hiddenInput.addTextChangedListener(afterTextChanged = { s ->
            if (s?.contains('\n') == true) submit()
        })
        lifecycleScope.launch {
            try {
                SdkManager.onHardware {
                    val sc = SdkManager.scanner()
                    sc.powerOn()
                    sc.trigger()
                }
            } catch (_: Exception) { /* scanner unavailable — user can type instead */ }
        }
    }

    private fun submit() {
        if (done) return
        done = true
        val text = b.hiddenInput.text.toString().replace("\n", "").trim()
        lifecycleScope.launch {
            try { SdkManager.onHardware { SdkManager.scanner().powerOff() } } catch (_: Exception) {}
        }
        if (text.isEmpty()) { finish(); return }
        setResult(RESULT_OK, Intent().putExtra(EXTRA_RESULT, text))
        finish()
    }

    companion object {
        const val EXTRA_RESULT = "scan_result"
    }
}
