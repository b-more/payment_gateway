package com.instacompay.pos.ui

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.api.Txn
import com.instacompay.pos.databinding.ActivityReceiptBinding
import com.instacompay.pos.hardware.PrinterService
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.launch

/** Success + on-screen receipt preview; prints once automatically. */
class ReceiptActivity : AppCompatActivity() {
    private lateinit var b: ActivityReceiptBinding
    private lateinit var txn: Txn
    private lateinit var network: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityReceiptBinding.inflate(layoutInflater)
        setContentView(b.root)

        network = intent.getStringExtra("network") ?: "MTN MoMo"
        txn = Txn(
            id = intent.getStringExtra("id").orEmpty(),
            type = "COLLECTION",
            processor = "",
            msisdn = intent.getStringExtra("msisdn"),
            amount = intent.getStringExtra("amount") ?: "0",
            charge = intent.getStringExtra("charge") ?: "0",
            netAmount = "0",
            totalAmount = intent.getStringExtra("total") ?: "0",
            status = intent.getStringExtra("status") ?: "SUCCESS",
            failureReason = null,
            collectionReference = null,
            environment = "LIVE",
        )

        val c = com.instacompay.pos.data.SecureCredentialStore(this).load()
        b.merchantName.text = c?.displayName ?: "InstacomPay"
        b.amountPaid.text = fmtK(txn.totalAmount)
        b.detailPhone.text = txn.msisdn ?: "-"
        b.detailNetwork.text = network
        b.detailRef.text = txn.id.take(8).uppercase()

        b.printBtn.setOnClickListener { print(reprint = true) }
        b.newSaleBtn.setOnClickListener { finish() }

        // Auto-print the first copy.
        print(reprint = false)
    }

    private fun print(reprint: Boolean) {
        b.printBtn.isEnabled = false
        lifecycleScope.launch {
            try {
                val receipt = buildReceipt(this@ReceiptActivity, txn, network, reprint)
                SdkManager.onHardware { SdkManager.printer().printSaleReceipt(receipt) }
                if (reprint) toast("Reprinted")
            } catch (e: PrinterService.PaperOutException) {
                toast("Printer out of paper")
            } catch (e: Exception) {
                toast("Print error: ${e.message}")
            } finally {
                b.printBtn.isEnabled = true
            }
        }
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
