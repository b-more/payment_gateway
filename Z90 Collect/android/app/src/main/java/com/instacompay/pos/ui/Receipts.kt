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

/** Build a merchant-branded receipt from stored credentials + a transaction. */
fun buildReceipt(context: Context, txn: Txn, network: String, reprint: Boolean = false): ReceiptData {
    val c = SecureCredentialStore(context).load()
    val logo = runCatching { BitmapFactory.decodeResource(context.resources, R.drawable.instacom_logo) }.getOrNull()
    val address = listOf(c?.address.orEmpty(), c?.city.orEmpty()).filter { it.isNotBlank() }
    return ReceiptData(
        merchantName = c?.displayName ?: "InstacomPay",
        addressLines = address,
        merchantPhone = c?.merchantPhone.orEmpty(),
        tpin = c?.tpin.orEmpty(),
        registrationNumber = c?.registrationNumber.orEmpty(),
        timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date()),
        amount = fmtK(txn.amount),
        charge = fmtK(txn.charge),
        total = fmtK(txn.totalAmount),
        msisdn = txn.msisdn ?: "-",
        network = network,
        status = txn.status,
        reference = txn.id.take(8).uppercase(),
        qrData = "${AppConfig.baseUrl}/v1/receipts/${txn.id}",
        logo = logo,
        reprint = reprint,
    )
}

fun fmtK(ngwee: String): String = "K%,.2f".format((ngwee.toLongOrNull() ?: 0L) / 100.0)
