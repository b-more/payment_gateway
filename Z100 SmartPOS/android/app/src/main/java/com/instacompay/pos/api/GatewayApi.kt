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
 * Thin OkHttp client for the InstacomPay /v1 API. Device auth is the simple
 * key+secret-over-TLS mode: `X-Api-Key` + `Authorization: Bearer <secret>`.
 * All calls are suspend and run on Dispatchers.IO.
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
                environment = nz(o, "environment") ?: "SANDBOX",
            )
        }

    // ── Payments ──
    suspend fun createCollection(
        processor: String, amountNgwee: String, msisdn: String, reference: String?, idempotencyKey: String,
    ): Txn = withContext(Dispatchers.IO) {
        txn(call(post("/v1/collections", paymentBody(processor, amountNgwee, msisdn, reference), auth = true, idempotencyKey = idempotencyKey)))
    }

    suspend fun createDisbursement(
        processor: String, amountNgwee: String, msisdn: String, reference: String?, idempotencyKey: String,
    ): Txn = withContext(Dispatchers.IO) {
        txn(call(post("/v1/disbursements", paymentBody(processor, amountNgwee, msisdn, reference), auth = true, idempotencyKey = idempotencyKey)))
    }

    suspend fun getTransaction(id: String): Txn = withContext(Dispatchers.IO) {
        txn(call(get("/v1/transactions/$id")))
    }

    suspend fun listTransactions(limit: Int = 25, cursor: String? = null): TxnPage =
        withContext(Dispatchers.IO) {
            val path = buildString {
                append("/v1/transactions?limit=").append(limit)
                if (!cursor.isNullOrBlank()) append("&cursor=").append(cursor)
            }
            val o = call(get(path))
            val arr = o.getJSONArray("items")
            val items = ArrayList<Txn>(arr.length())
            for (i in 0 until arr.length()) items.add(txn(arr.getJSONObject(i)))
            TxnPage(items, nz(o, "next_cursor"))
        }

    // ── request plumbing ──
    private fun paymentBody(processor: String, amountNgwee: String, msisdn: String, reference: String?): JSONObject {
        val b = JSONObject().put("processor", processor).put("amount", amountNgwee).put("msisdn", msisdn)
        if (!reference.isNullOrBlank()) b.put("collectionReference", reference)
        return b
    }

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
