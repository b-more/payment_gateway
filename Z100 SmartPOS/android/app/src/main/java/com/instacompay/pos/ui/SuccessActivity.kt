package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.api.Txn
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivitySuccessBinding
import com.instacompay.pos.hardware.PrinterService
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.launch

/** Post-sale confirmation with an on-screen receipt; auto-prints once. */
class SuccessActivity : AppCompatActivity() {
    private lateinit var b: ActivitySuccessBinding
    private val store by lazy { SecureCredentialStore(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivitySuccessBinding.inflate(layoutInflater)
        setContentView(b.root)

        val id = intent.getStringExtra("id").orEmpty()
        val amount = intent.getStringExtra("amount") ?: "0"
        val charge = intent.getStringExtra("charge") ?: "0"
        val total = intent.getStringExtra("total") ?: amount
        val msisdn = intent.getStringExtra("msisdn") ?: "-"
        val network = intent.getStringExtra("network").orEmpty()
        val status = intent.getStringExtra("status") ?: "SUCCESS"

        val creds = store.load()
        b.successAmount.text = fmtK(total)
        b.successMeta.text = "$network · $msisdn · ${id.take(8)}"
        b.rcMerchant.text = creds?.merchantName?.ifBlank { creds.accountNumber } ?: "InstacomPay"
        b.rcBranch.text = creds?.branch.orEmpty()
        b.rcDetails.text = buildString {
            appendLine(padRow("Amount", fmtK(amount)))
            if (charge != "0") appendLine(padRow("Charge", fmtK(charge)))
            appendLine(padRow("Total", fmtK(total)))
            appendLine(padRow("Phone", msisdn))
            appendLine(padRow("Network", network))
            appendLine(padRow("Status", status))
            append(padRow("Ref", id.take(8)))
        }

        val txn = Txn(id, "COLLECTION", network, msisdn, amount, charge, "0", total, status, null, null, "")
        printReceipt(txn, msisdn, network)   // auto-print once

        b.printBtn.setOnClickListener { printReceipt(txn, msisdn, network) }
        b.newSaleBtn.setOnClickListener {
            startActivity(Intent(this, SellActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            finish()
        }
    }

    private fun printReceipt(txn: Txn, msisdn: String, network: String) {
        val data = buildReceipt(this, txn, msisdn, network)
        lifecycleScope.launch {
            try {
                SdkManager.onHardware { SdkManager.printer().printSaleReceipt(data) }
            } catch (e: PrinterService.PaperOutException) {
                Toast.makeText(this@SuccessActivity, "Printer out of paper", Toast.LENGTH_LONG).show()
            } catch (_: Exception) {
            }
        }
    }

    private fun padRow(label: String, value: String): String {
        val width = 28
        val gap = (width - label.length - value.length).coerceAtLeast(1)
        return label + " ".repeat(gap) + value
    }

    private fun fmtK(ngwee: String) = "K%,.2f".format((ngwee.toLongOrNull() ?: 0L) / 100.0)
}
