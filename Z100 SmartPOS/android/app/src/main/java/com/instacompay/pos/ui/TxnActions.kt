package com.instacompay.pos.ui

import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.api.ApiException
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.api.Txn
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.hardware.PrinterService
import com.instacompay.pos.hardware.ReceiptData
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * Shared per-transaction actions (reprint receipt, refund-as-disbursement),
 * used by both the History list and the Dashboard recent-sales preview.
 */
object TxnActions {

    fun show(activity: AppCompatActivity, t: Txn, onChanged: () -> Unit = {}) {
        AlertDialog.Builder(activity)
            .setTitle("${fmtK(t.amount)} • ${t.status}")
            .setItems(arrayOf("Reprint receipt", "Refund to customer", "Cancel")) { _, which ->
                when (which) {
                    0 -> reprint(activity, t)
                    1 -> confirmRefund(activity, t, onChanged)
                }
            }
            .show()
    }

    private fun reprint(activity: AppCompatActivity, t: Txn) {
        activity.lifecycleScope.launch {
            try {
                val data = buildReceipt(activity, t, t.msisdn ?: "-", t.processor, reprint = true)
                SdkManager.onHardware { SdkManager.printer().printSaleReceipt(data) }
                toast(activity, "Reprinted")
            } catch (e: PrinterService.PaperOutException) {
                toast(activity, "Printer out of paper")
            } catch (e: Exception) {
                toast(activity, "Print error")
            }
        }
    }

    private fun confirmRefund(activity: AppCompatActivity, t: Txn, onChanged: () -> Unit) {
        val msisdn = t.msisdn
        if (msisdn.isNullOrBlank()) { toast(activity, "No phone number on this transaction"); return }
        if (t.status != "SUCCESS") { toast(activity, "Only a successful sale can be refunded"); return }
        AlertDialog.Builder(activity)
            .setTitle("Refund ${fmtK(t.amount)}?")
            .setMessage("This sends a NEW payout of ${fmtK(t.amount)} to $msisdn. It is a disbursement, not a card reversal.")
            .setPositiveButton("Refund") { _, _ -> refund(activity, t, msisdn, onChanged) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun refund(activity: AppCompatActivity, t: Txn, msisdn: String, onChanged: () -> Unit) {
        val api = GatewayApi(SecureCredentialStore(activity))
        toast(activity, "Refunding…")
        activity.lifecycleScope.launch {
            try {
                val d = api.createDisbursement(t.processor, t.amount, msisdn, "refund:${t.id}", UUID.randomUUID().toString())
                toast(activity, "Refund ${d.status}")
                onChanged()
            } catch (e: ApiException) {
                if (activity.lockIfRevoked(e)) return@launch
                toast(activity, e.message ?: "Refund failed")
            } catch (e: Exception) {
                toast(activity, "Error: ${e.message}")
            }
        }
    }

    private fun toast(activity: AppCompatActivity, m: String) = Toast.makeText(activity, m, Toast.LENGTH_SHORT).show()
    private fun fmtK(ngwee: String): String {
        val n = ngwee.toLongOrNull() ?: 0L
        return "K%,.2f".format(n / 100.0)
    }
}
