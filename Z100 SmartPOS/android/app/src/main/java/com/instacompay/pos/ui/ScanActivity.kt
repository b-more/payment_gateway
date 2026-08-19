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
            // A barcode scan is committed with a trailing newline/return.
            if (s?.contains('\n') == true) submit()
        })
        b.cancelBtn.setOnClickListener { done = true; powerOff(); finish() }
        b.useBtn.setOnClickListener { submit() }
        b.rescanBtn.setOnClickListener { b.hiddenInput.setText(""); b.hiddenInput.requestFocus(); trigger() }
        startScanner()
    }

    private fun startScanner() {
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

    private fun trigger() {
        lifecycleScope.launch {
            try { SdkManager.onHardware { SdkManager.scanner().trigger() } } catch (_: Exception) {}
        }
    }

    private fun powerOff() {
        lifecycleScope.launch {
            try { SdkManager.onHardware { SdkManager.scanner().powerOff() } } catch (_: Exception) {}
        }
    }

    private fun submit() {
        if (done) return
        val text = b.hiddenInput.text.toString().replace("\n", "").trim()
        if (text.isEmpty()) return  // nothing scanned yet — keep waiting
        done = true
        powerOff()
        setResult(RESULT_OK, Intent().putExtra(EXTRA_RESULT, text))
        finish()
    }

    companion object {
        const val EXTRA_RESULT = "scan_result"
    }
}
