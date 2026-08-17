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
import com.instacompay.pos.api.Txn
import com.instacompay.pos.data.LocalTxn
import com.instacompay.pos.data.LocalTxnStore
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivitySaleBinding
import com.instacompay.pos.hardware.PrinterService
import com.instacompay.pos.hardware.ReceiptData
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/** Landscape keypad register: amount on the left, keypad on the right. */
class SaleActivity : AppCompatActivity() {
    private lateinit var b: ActivitySaleBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }
    private val local by lazy { LocalTxnStore(this) }

    private var typed = ""          // Kwacha as typed: "2", "2.5", "2.50"
    private var processor = "MTN"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivitySaleBinding.inflate(layoutInflater)
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

        b.chargeBtn.setOnClickListener { charge() }

        // Pre-fill from a cart charge (Sell screen), else start empty.
        val pre = intent.getLongExtra(EXTRA_AMOUNT_NGWEE, 0L)
        if (pre > 0) typed = ngweeToTyped(pre)
        setProcessor("MTN")
        render()
    }

    private fun ngweeToTyped(ngwee: Long): String {
        val whole = ngwee / 100
        val frac = ngwee % 100
        return if (frac == 0L) whole.toString() else "%d.%02d".format(whole, frac)
    }

    // ── keypad ──
    private fun press(k: String) {
        when (k) {
            "." -> if (!typed.contains(".")) typed = if (typed.isEmpty()) "0." else "$typed."
            "del" -> if (typed.isNotEmpty()) typed = typed.dropLast(1)
            else -> {
                val dot = typed.indexOf('.')
                if (dot >= 0 && typed.length - dot - 1 >= 2) return       // max 2 decimals
                if (typed.replace(".", "").length >= 9) return            // sane cap
                typed = if (typed == "0") k else typed + k               // no leading zeros
            }
        }
        render()
    }

    private fun render() {
        b.amountText.text = typed.ifEmpty { "0" }
        val ngwee = kwachaToNgwee(typed)?.toLongOrNull()
        b.chargeBtn.isEnabled = ngwee != null
        b.chargeBtn.text = if (ngwee != null) "Charge K%,.2f".format(ngwee / 100.0) else "Charge"
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

    // ── charge ──
    private fun charge() {
        val amountNgwee = kwachaToNgwee(typed)
        val msisdn = b.msisdn.text.toString().trim()
        if (amountNgwee == null) { toast("Enter an amount"); return }
        if (!msisdn.matches(Regex("^260\\d{9}$"))) { toast("Phone must be 260XXXXXXXXX"); return }

        val idempotencyKey = UUID.randomUUID().toString()
        setBusy(true, "Requesting payment…")
        lifecycleScope.launch {
            try {
                var txn = api.createCollection(processor, amountNgwee, msisdn, null, idempotencyKey)
                local.upsert(LocalTxn(txn.id, idempotencyKey, processor, msisdn, amountNgwee, txn.status, null, System.currentTimeMillis()))
                txn = poll(txn)
                local.updateStatus(txn.id, txn.status)
                when {
                    txn.isSuccess -> {
                        printReceipt(txn, msisdn)
                        b.status.setTextColor(ContextCompat.getColor(this@SaleActivity, R.color.success))
                        b.status.text = "Paid • K%,.2f".format(txn.amount.toLong() / 100.0)
                        typed = ""; render(); b.msisdn.text?.clear()
                    }
                    !txn.isTerminal -> b.status.text = "Still processing — check History"
                    else -> {
                        b.status.setTextColor(ContextCompat.getColor(this@SaleActivity, R.color.accent))
                        b.status.text = "Not completed: ${txn.failureReason ?: txn.status}"
                    }
                }
            } catch (e: ApiException) {
                if (lockIfRevoked(e)) return@launch
                b.status.setTextColor(ContextCompat.getColor(this@SaleActivity, R.color.accent))
                b.status.text = e.message
            } catch (e: Exception) {
                b.status.text = "Error: ${e.message}"
            } finally {
                setBusy(false, null)
            }
        }
    }

    private suspend fun poll(initial: Txn): Txn {
        var txn = initial
        var attempts = 0
        while (!txn.isTerminal && attempts < 40) {
            b.status.setTextColor(ContextCompat.getColor(this, R.color.slate))
            b.status.text = "Waiting for customer to approve…"
            delay(3000)
            txn = api.getTransaction(txn.id)
            attempts++
        }
        return txn
    }

    private suspend fun printReceipt(txn: Txn, msisdn: String) {
        val data = buildReceipt(this, txn, msisdn, processor)
        try {
            SdkManager.onHardware { SdkManager.printer().printSaleReceipt(data) }
        } catch (e: PrinterService.PaperOutException) {
            toast("Printer out of paper")
        }
    }

    private fun setBusy(busy: Boolean, message: String?) {
        b.chargeBtn.isEnabled = !busy && kwachaToNgwee(typed) != null
        if (message != null) {
            b.status.setTextColor(ContextCompat.getColor(this, R.color.slate))
            b.status.text = message
        }
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()

    /** Kwacha string -> integer ngwee string (digit-by-digit, no float drift). */
    private fun kwachaToNgwee(input: String): String? {
        val s = input.trim()
        if (!s.matches(Regex("^\\d+(\\.\\d{1,2})?$"))) return null
        val parts = s.split(".")
        val whole = parts[0].toLongOrNull() ?: return null
        val frac = if (parts.size > 1) parts[1].padEnd(2, '0').toLong() else 0L
        val ngwee = whole * 100 + frac
        return if (ngwee <= 0) null else ngwee.toString()
    }

    companion object {
        const val EXTRA_AMOUNT_NGWEE = "amount_ngwee"
    }
}
