package com.instacompay.pos.ui

import android.os.Bundle
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.api.ApiException
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivityDisburseBinding
import kotlinx.coroutines.launch

/** Maker-checker payout: the terminal requests a payout; a manager approves it. */
class DisburseActivity : AppCompatActivity() {
    private lateinit var b: ActivityDisburseBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }

    private var typed = ""
    private var processor = "MTN"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityDisburseBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.backBtn.setOnClickListener { finish() }
        b.mtnBtn.setOnClickListener { setProcessor("MTN") }
        b.airtelBtn.setOnClickListener { setProcessor("AIRTEL") }

        val digits = mapOf(
            b.key0 to "0", b.key1 to "1", b.key2 to "2", b.key3 to "3", b.key4 to "4",
            b.key5 to "5", b.key6 to "6", b.key7 to "7", b.key8 to "8", b.key9 to "9",
        )
        for ((view, d) in digits) view.setOnClickListener { press(d) }
        b.keyDot.setOnClickListener { press(".") }
        b.keyDel.setOnClickListener { press("del") }
        b.requestBtn.setOnClickListener { request() }

        setProcessor("MTN")
        render()
    }

    private fun press(k: String) {
        when (k) {
            "." -> if (!typed.contains(".")) typed = if (typed.isEmpty()) "0." else "$typed."
            "del" -> if (typed.isNotEmpty()) typed = typed.dropLast(1)
            else -> {
                val dot = typed.indexOf('.')
                if (dot >= 0 && typed.length - dot - 1 >= 2) return
                if (typed.replace(".", "").length >= 9) return
                typed = if (typed == "0") k else typed + k
            }
        }
        render()
    }

    private fun render() {
        b.amountText.text = typed.ifEmpty { "0" }
        val ngwee = kwachaToNgwee(typed)?.toLongOrNull()
        b.requestBtn.isEnabled = ngwee != null
        b.requestBtn.text = if (ngwee != null) "Request K%,.2f".format(ngwee / 100.0) else "Request payout"
    }

    private fun setProcessor(p: String) {
        processor = p
        styleSeg(b.mtnBtn, p == "MTN")
        styleSeg(b.airtelBtn, p == "AIRTEL")
    }

    private fun styleSeg(tv: TextView, on: Boolean) {
        tv.setBackgroundResource(if (on) R.drawable.bg_seg_on else 0)
        tv.setTextColor(ContextCompat.getColor(this, if (on) R.color.brand else R.color.slate))
    }

    private fun request() {
        val amountNgwee = kwachaToNgwee(typed)
        val msisdn = b.msisdn.text.toString().trim()
        val reason = b.reason.text.toString().trim().ifEmpty { null }
        if (amountNgwee == null) { toast("Enter an amount"); return }
        if (!msisdn.matches(Regex("^260\\d{9}$"))) { toast("Phone must be 260XXXXXXXXX"); return }

        b.requestBtn.isEnabled = false
        b.status.setTextColor(ContextCompat.getColor(this, R.color.slate))
        b.status.text = "Requesting…"
        lifecycleScope.launch {
            try {
                api.requestPayout(processor, amountNgwee, msisdn, reason)
                b.status.setTextColor(ContextCompat.getColor(this@DisburseActivity, R.color.success))
                b.status.text = "Sent for approval — a manager approves it in the portal"
                typed = ""; render(); b.msisdn.text?.clear(); b.reason.text?.clear()
            } catch (e: ApiException) {
                if (lockIfRevoked(e)) return@launch
                b.status.setTextColor(ContextCompat.getColor(this@DisburseActivity, R.color.accent))
                b.status.text = e.message
                render()
            } catch (e: Exception) {
                b.status.text = "Error: ${e.message}"
                render()
            }
        }
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()

    private fun kwachaToNgwee(input: String): String? {
        val s = input.trim()
        if (!s.matches(Regex("^\\d+(\\.\\d{1,2})?$"))) return null
        val parts = s.split(".")
        val whole = parts[0].toLongOrNull() ?: return null
        val frac = if (parts.size > 1) parts[1].padEnd(2, '0').toLong() else 0L
        val ngwee = whole * 100 + frac
        return if (ngwee <= 0) null else ngwee.toString()
    }
}
