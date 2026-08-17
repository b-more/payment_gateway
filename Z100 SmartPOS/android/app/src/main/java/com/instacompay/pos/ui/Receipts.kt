package com.instacompay.pos.ui

import android.content.Context
import android.graphics.BitmapFactory
import com.instacompay.pos.R
import com.instacompay.pos.api.Txn
import com.instacompay.pos.config.AppConfig
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.hardware.ReceiptData
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Build a receipt (with merchant/branch, logo, and a scannable receipt URL). */
fun buildReceipt(context: Context, txn: Txn, msisdn: String, network: String, reprint: Boolean = false): ReceiptData {
    val creds = SecureCredentialStore(context).load()
    val logo = runCatching { BitmapFactory.decodeResource(context.resources, R.drawable.instacom_logo) }.getOrNull()
    return ReceiptData(
        merchantName = creds?.merchantName?.ifBlank { creds.accountNumber } ?: "InstacomPay",
        branch = creds?.branch.orEmpty(),
        timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date()),
        amount = fmtReceiptK(txn.amount),
        charge = fmtReceiptK(txn.charge),
        total = fmtReceiptK(txn.totalAmount),
        msisdn = msisdn,
        network = network,
        status = txn.status,
        reference = txn.id.take(8),
        qrData = "${AppConfig.baseUrl}/v1/receipts/${txn.id}",
        logo = logo,
        reprint = reprint,
    )
}

private fun fmtReceiptK(ngwee: String) = "K%,.2f".format((ngwee.toLongOrNull() ?: 0L) / 100.0)
