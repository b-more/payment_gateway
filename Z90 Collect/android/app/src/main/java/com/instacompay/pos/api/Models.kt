package com.instacompay.pos.api

/** Credential + merchant profile issued when a terminal is activated. */
data class ActivationResult(
    val deviceId: String,
    val apiKey: String,
    val secret: String,
    val signingKey: String,
    val accountNumber: String,
    val merchantName: String,
    val branch: String,
    val environment: String,
    // Merchant profile — printed on the receipt.
    val tradingName: String,
    val address: String,
    val city: String,
    val tpin: String,
    val merchantPhone: String,
    val registrationNumber: String,
)

/** A gateway transaction (mirrors /v1 TransactionResponse; money = ngwee strings). */
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
