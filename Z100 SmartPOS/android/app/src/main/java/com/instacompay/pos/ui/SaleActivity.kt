package com.instacompay.pos.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
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

/** Take a mobile-money payment: amount + phone → collect → poll → print. */
class SaleActivity : AppCompatActivity() {
    private lateinit var b: ActivitySaleBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }
    private val local by lazy { LocalTxnStore(this) }
    private val processors = listOf("MTN", "AIRTEL")

    private val scanForResult = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        if (res.resultCode == RESULT_OK) applyScanned(res.data?.getStringExtra(ScanActivity.EXTRA_RESULT).orEmpty())
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivitySaleBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.processor.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, processors)
        b.subtitle.text = "Account ${store.load()?.accountNumber.orEmpty()}"
        b.chargeBtn.setOnClickListener { charge() }
        b.testPrintBtn.setOnClickListener { testPrint() }
        b.historyBtn.setOnClickListener { startActivity(Intent(this, HistoryActivity::class.java)) }
        b.scanBtn.setOnClickListener { scanForResult.launch(Intent(this, ScanActivity::class.java)) }
    }

    private fun applyScanned(text: String) {
        val uri = runCatching { Uri.parse(text) }.getOrNull()
        if (uri != null && uri.scheme == "instacompay") {
            uri.getQueryParameter("msisdn")?.let { b.msisdn.setText(it) }
            uri.getQueryParameter("amount")?.let { b.amount.setText(it) }
            uri.getQueryParameter("ref")?.let { b.reference.setText(it) }
        } else if (text.isNotBlank()) {
            b.msisdn.setText(text.filter { it.isDigit() })
        }
    }

    private fun charge() {
        val msisdn = b.msisdn.text.toString().trim()
        val processor = processors[b.processor.selectedItemPosition]
        val reference = b.reference.text.toString().trim().ifEmpty { null }
        // The cashier types Kwacha (2, 2.5, 2.50); the wire wants integer ngwee.
        val amountNgwee = kwachaToNgwee(b.amount.text.toString())
        if (amountNgwee == null) {
            Toast.makeText(this, "Enter a valid amount, e.g. 2 or 2.50", Toast.LENGTH_SHORT).show(); return
        }
        if (!msisdn.matches(Regex("^260\\d{9}$"))) {
            Toast.makeText(this, "Phone must be 260XXXXXXXXX", Toast.LENGTH_SHORT).show(); return
        }
        val idempotencyKey = UUID.randomUUID().toString()
        setBusy(true, "Requesting payment…")
        lifecycleScope.launch {
            try {
                var txn = api.createCollection(processor, amountNgwee, msisdn, reference, idempotencyKey)
                // Persist with the idempotency key so a retry never double-charges.
                local.upsert(LocalTxn(txn.id, idempotencyKey, processor, msisdn, amountNgwee, txn.status, reference, System.currentTimeMillis()))
                txn = poll(txn)
                local.updateStatus(txn.id, txn.status)
                when {
                    txn.isSuccess -> {
                        printReceipt(txn, msisdn, reference)
                        b.status.text = "Paid • ${fmtK(txn.amount)}"
                        b.amount.text?.clear(); b.msisdn.text?.clear(); b.reference.text?.clear()
                    }
                    !txn.isTerminal -> b.status.text = "Still processing — check History in a moment"
                    else -> b.status.text = "Not completed: ${txn.failureReason ?: txn.status}"
                }
            } catch (e: ApiException) {
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
        // ~2 minutes; the gateway re-enquires the rail on each read, so this
        // resolves as soon as the customer approves.
        while (!txn.isTerminal && attempts < 40) {
            b.status.text = "Waiting for customer to approve on their phone…"
            delay(3000)
            txn = api.getTransaction(txn.id)
            attempts++
        }
        return txn
    }

    private suspend fun printReceipt(txn: Txn, msisdn: String, reference: String?) {
        val data = ReceiptData(
            merchantName = store.load()?.accountNumber ?: "InstacomPay",
            timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date()),
            amount = fmtK(txn.amount),
            charge = fmtK(txn.charge),
            total = fmtK(txn.totalAmount),
            msisdn = msisdn,
            status = txn.status,
            reference = reference ?: txn.id.take(8),
            qrData = txn.id,
        )
        try {
            SdkManager.onHardware { SdkManager.printer().printSaleReceipt(data) }
        } catch (e: PrinterService.PaperOutException) {
            Toast.makeText(this, "Printer out of paper", Toast.LENGTH_LONG).show()
        }
    }

    private fun testPrint() {
        setBusy(true, "Printing test…")
        lifecycleScope.launch {
            try {
                SdkManager.onHardware { SdkManager.printer().printTestReceipt() }
                b.status.text = "Printed test receipt"
            } catch (e: PrinterService.PaperOutException) {
                b.status.text = "Printer out of paper"
            } catch (e: Exception) {
                b.status.text = "Print error: ${e.message}"
            } finally {
                setBusy(false, null)
            }
        }
    }

    private fun setBusy(busy: Boolean, message: String?) {
        b.chargeBtn.isEnabled = !busy
        b.testPrintBtn.isEnabled = !busy
        if (message != null) b.status.text = message
    }

    private fun fmtK(ngwee: String): String {
        val n = ngwee.toLongOrNull() ?: 0L
        return "K%,.2f".format(n / 100.0)
    }

    /**
     * Kwacha (as typed: "2", "2.5", "2.50", "0.05") -> integer ngwee string.
     * Parsed digit-by-digit so there is no binary float drift; null if invalid
     * (more than 2 decimals, non-numeric, or zero).
     */
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
