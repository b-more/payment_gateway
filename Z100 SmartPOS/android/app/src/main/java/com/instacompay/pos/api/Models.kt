package com.instacompay.pos.api

/** Credential + identity issued when a terminal is activated (POST /v1/devices/activate). */
data class ActivationResult(
    val deviceId: String,
    val apiKey: String,
    val secret: String,
    val signingKey: String,
    val accountNumber: String,
    val merchantName: String,
    val branch: String,
    val environment: String,
)

/** A gateway transaction (mirrors the /v1 TransactionResponse; money = ngwee strings). */
data class Txn(
    val id: String,
    val type: String,
    val processor: String,
    val msisdn: String?,
    val amount: String,
    val charge: String,
    val netAmount: String,
    val totalAmount: String,
    val status: String,
    val failureReason: String?,
    val collectionReference: String?,
    val environment: String,
) {
    val isTerminal: Boolean get() = status in TERMINAL
    val isSuccess: Boolean get() = status == "SUCCESS"

    companion object {
        val TERMINAL = setOf("SUCCESS", "FAILED", "REVERSED", "EXPIRED")
    }
}

/** One page of the device-scoped transaction list (GET /v1/transactions). */
data class TxnPage(val items: List<Txn>, val nextCursor: String?)

/** Account balance (GET /v1/accounts/balance). Money as ngwee string. */
data class Balance(val floatBalance: String, val operatingMode: String)

/** A catalog product (GET/POST /v1/products). Price in ngwee string. */
data class Product(
    val id: String,
    val name: String,
    val priceNgwee: String,
    val category: String?,
    val hasImage: Boolean = false,
    val barcode: String? = null,
)

/** A payout to the merchant's bank (GET /v1/settlements). Amount in ngwee string. */
data class Settlement(
    val id: String,
    val amount: String,
    val status: String,
    val settledAt: String?,
    val createdAt: String,
)

/** Takings summary for the Reports screen (GET /v1/reports/summary). Money = ngwee strings. */
data class ReportSummary(
    val range: String,
    val collectionsCount: Int,
    val gross: String,
    val charges: String,
    val net: String,
    val payoutsCount: Int,
    val payoutsTotal: String,
    val rails: List<RailLine>,
)

data class RailLine(val processor: String, val count: Int, val gross: String)
