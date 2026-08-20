package com.instacompay.pos.api

import com.instacompay.pos.config.AppConfig
import com.instacompay.pos.data.SecureCredentialStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** A structured gateway error (`{ "error": { code, message } }`). */
class ApiException(val statusCode: Int, val code: String, message: String) : Exception(message)

/**
 * Thin OkHttp client for the InstacomPay /v1 API — collections only. Device auth
 * is key+secret over TLS: `X-Api-Key` + `Authorization: Bearer <secret>`.
 */
class GatewayApi(private val creds: SecureCredentialStore) {

    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    // ── Activation (no credential yet) ──
    suspend fun activate(activationCode: String, serialNumber: String): ActivationResult =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("activationCode", activationCode)
                .put("serialNumber", serialNumber)
            val o = call(post("/v1/devices/activate", body, auth = false, idempotencyKey = null))
            ActivationResult(
                deviceId = o.getString("device_id"),
                apiKey = o.getString("api_key"),
                secret = o.getString("secret"),
                signingKey = nz(o, "signing_key").orEmpty(),
                accountNumber = nz(o, "account_number").orEmpty(),
                merchantName = nz(o, "merchant_name").orEmpty(),
                branch = nz(o, "branch").orEmpty(),
                environment = nz(o, "environment") ?: "SANDBOX",
                tradingName = nz(o, "trading_name").orEmpty(),
                address = nz(o, "address").orEmpty(),
                city = nz(o, "city").orEmpty(),
                tpin = nz(o, "tpin").orEmpty(),
                merchantPhone = nz(o, "merchant_phone").orEmpty(),
                registrationNumber = nz(o, "registration_number").orEmpty(),
            )
        }

    // ── Collection ──
    suspend fun createCollection(
        processor: String, amountNgwee: String, msisdn: String, reference: String?, idempotencyKey: String,
    ): Txn = withContext(Dispatchers.IO) {
        val b = JSONObject().put("processor", processor).put("amount", amountNgwee).put("msisdn", msisdn)
        if (!reference.isNullOrBlank()) b.put("collectionReference", reference)
        txn(call(post("/v1/collections", b, auth = true, idempotencyKey = idempotencyKey)))
    }

    suspend fun getTransaction(id: String): Txn = withContext(Dispatchers.IO) {
        txn(call(get("/v1/transactions/$id")))
    }

    /** Text the customer a link to their receipt (defaults to the payer's number). */
    suspend fun sendReceipt(txnId: String, phone: String?): Unit = withContext(Dispatchers.IO) {
        val body = JSONObject()
        if (!phone.isNullOrBlank()) body.put("phone", phone)
        call(post("/v1/transactions/$txnId/send-receipt", body, auth = true, idempotencyKey = null))
        Unit
    }

    // ── request plumbing ──
    private fun post(path: String, body: JSONObject, auth: Boolean, idempotencyKey: String?): Request {
        val b = Request.Builder().url(AppConfig.baseUrl + path).post(body.toString().toRequestBody(jsonType))
        idempotencyKey?.let { b.header("Idempotency-Key", it) }
        if (auth) authHeaders(b)
        return b.build()
    }

    private fun get(path: String): Request {
        val b = Request.Builder().url(AppConfig.baseUrl + path).get()
        authHeaders(b)
        return b.build()
    }

    private fun authHeaders(b: Request.Builder) {
        val c = creds.load() ?: throw ApiException(401, "NO_CREDENTIALS", "terminal is not activated")
        b.header("X-Api-Key", c.apiKey).header("Authorization", "Bearer " + c.secret)
    }

    private fun call(req: Request): JSONObject {
        client.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                val err = parseError(text, resp.code)
                throw ApiException(resp.code, err.first, err.second)
            }
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        }
    }

    private fun parseError(text: String, status: Int): Pair<String, String> = try {
        val e = JSONObject(text).getJSONObject("error")
        e.optString("code", "ERROR") to e.optString("message", "Request failed")
    } catch (_: Exception) {
        "ERROR" to "Request failed ($status)"
    }

    private fun nz(o: JSONObject, key: String): String? = if (o.isNull(key)) null else o.optString(key)

    private fun txn(o: JSONObject) = Txn(
        id = o.getString("id"),
        type = o.optString("type"),
        processor = o.optString("processor"),
        msisdn = nz(o, "msisdn"),
        amount = o.optString("amount", "0"),
        charge = o.optString("charge", "0"),
        netAmount = o.optString("net_amount", "0"),
        totalAmount = o.optString("total_amount", "0"),
        status = o.optString("status"),
        failureReason = nz(o, "failure_reason"),
        collectionReference = nz(o, "collection_reference"),
        environment = o.optString("environment", "SANDBOX"),
    )
}
