package com.instacompay.pos.ui

import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.api.ApiException
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.api.Txn
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivityHistoryBinding
import com.instacompay.pos.hardware.PrinterService
import com.instacompay.pos.hardware.ReceiptData
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/** Device-scoped history with reprint and refund-as-disbursement. */
class HistoryActivity : AppCompatActivity() {
    private lateinit var b: ActivityHistoryBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }
    private var txns: List<Txn> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityHistoryBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.list.setOnItemClickListener { _, _, pos, _ -> onRow(txns[pos]) }
        load()
    }

    private fun load() {
        b.status.text = "Loading…"
        lifecycleScope.launch {
            try {
                txns = api.listTransactions(50).items
                b.list.adapter = ArrayAdapter(this@HistoryActivity, android.R.layout.simple_list_item_1, txns.map { rowText(it) })
                b.status.text = if (txns.isEmpty()) "No transactions yet" else ""
            } catch (e: Exception) {
                b.status.text = "Error: ${e.message}"
            }
        }
    }

    private fun rowText(t: Txn) = "${fmtK(t.amount)}  •  ${t.processor}  •  ${t.status}  •  ${t.msisdn ?: "-"}"

    private fun onRow(t: Txn) {
        AlertDialog.Builder(this)
            .setTitle("${fmtK(t.amount)} • ${t.status}")
            .setItems(arrayOf("Reprint receipt", "Refund to customer", "Cancel")) { _, which ->
                when (which) {
                    0 -> reprint(t)
                    1 -> confirmRefund(t)
                }
            }
            .show()
    }

    private fun reprint(t: Txn) {
        lifecycleScope.launch {
            try {
                val data = ReceiptData(
                    merchantName = store.load()?.accountNumber ?: "InstacomPay",
                    timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date()),
                    amount = fmtK(t.amount), charge = fmtK(t.charge), total = fmtK(t.totalAmount),
                    msisdn = t.msisdn ?: "-", status = t.status,
                    reference = t.collectionReference ?: t.id.take(8), qrData = t.id, reprint = true,
                )
                SdkManager.onHardware { SdkManager.printer().printSaleReceipt(data) }
                toast("Reprinted")
            } catch (e: PrinterService.PaperOutException) {
                toast("Printer out of paper")
            } catch (e: Exception) {
                toast("Print error")
            }
        }
    }

    private fun confirmRefund(t: Txn) {
        val msisdn = t.msisdn
        if (msisdn.isNullOrBlank()) { toast("No phone number on this transaction"); return }
        AlertDialog.Builder(this)
            .setTitle("Refund ${fmtK(t.amount)}?")
            .setMessage("This sends a NEW payout of ${fmtK(t.amount)} to $msisdn. It is a disbursement, not a card reversal.")
            .setPositiveButton("Refund") { _, _ -> refund(t, msisdn) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun refund(t: Txn, msisdn: String) {
        b.status.text = "Refunding…"
        lifecycleScope.launch {
            try {
                val d = api.createDisbursement(t.processor, t.amount, msisdn, "refund:${t.id}", UUID.randomUUID().toString())
                b.status.text = "Refund ${d.status}"
            } catch (e: ApiException) {
                b.status.text = e.message
            } catch (e: Exception) {
                b.status.text = "Error: ${e.message}"
            }
        }
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()

    private fun fmtK(ngwee: String): String {
        val n = ngwee.toLongOrNull() ?: 0L
        return "K%,.2f".format(n / 100.0)
    }
}
