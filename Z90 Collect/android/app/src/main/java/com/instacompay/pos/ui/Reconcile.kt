package com.instacompay.pos.ui

import com.instacompay.pos.api.ApiException
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.data.LocalTxnStore

/**
 * Confirm any sale whose outcome we never saw.
 *
 * CRITICAL: a sale that already has a server id is only POLLED — never re-created.
 * Re-issuing createCollection makes the gateway send the customer ANOTHER prompt,
 * which is what caused "the prompt keeps coming back". Only a sale that never got
 * a server id (the create call didn't return) and is still fresh is re-issued,
 * with the SAME idempotency key. Anything older than a few minutes is expired
 * locally so we stop touching it.
 *
 * Throws ApiException(401) so the caller can lock the terminal; other errors are
 * swallowed (offline / transient — retried next time).
 */
suspend fun reconcileLocal(api: GatewayApi, local: LocalTxnStore) {
    val now = System.currentTimeMillis()
    for (s in local.needingReconcile()) {
        val ageMs = now - s.createdAt
        try {
            when {
                ageMs > 15 * 60_000L ->
                    local.upsert(s.copy(status = "EXPIRED", failureReason = "timed out"))

                s.serverId.isNotBlank() -> {
                    // Known transaction → just read its status; NEVER re-dispatch.
                    val txn = api.getTransaction(s.serverId)
                    local.upsert(s.copy(
                        status = txn.status, chargeNgwee = txn.charge, totalNgwee = txn.totalAmount,
                        reference = txn.id.take(8).uppercase(), failureReason = txn.failureReason,
                    ))
                }

                ageMs < 5 * 60_000L -> {
                    // The create never confirmed (no server id). Re-issue with the
                    // SAME key — idempotent, and the gateway won't re-prompt.
                    val txn = api.createCollection(s.processor, s.amountNgwee, s.msisdn, null, s.idempotencyKey)
                    local.upsert(s.copy(
                        serverId = txn.id, status = txn.status, chargeNgwee = txn.charge,
                        totalNgwee = txn.totalAmount, reference = txn.id.take(8).uppercase(), failureReason = txn.failureReason,
                    ))
                }

                else -> local.upsert(s.copy(status = "EXPIRED", failureReason = "no confirmation"))
            }
        } catch (e: ApiException) {
            if (e.statusCode == 401) throw e
            // otherwise leave the row for the next pass
        } catch (_: Exception) { /* still offline */ }
    }
}
