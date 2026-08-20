package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.api.ApiException
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.api.Txn
import com.instacompay.pos.data.LocalSale
import com.instacompay.pos.data.LocalTxnStore
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivityCollectBinding
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

/** The one screen that matters: take a mobile-money payment, then print a receipt. */
class CollectActivity : AppCompatActivity() {
    private lateinit var b: ActivityCollectBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }
    private val local by lazy { LocalTxnStore(this) }

    private var typed = ""
    private var processor = "MTN"
    private var busy = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityCollectBinding.inflate(layoutInflater)
        setContentView(b.root)

        val c = store.load()
        b.merchantName.text = c?.displayName ?: "InstacomPay"
        b.envBadge.visibility = if (c?.environment == "LIVE") View.GONE else View.VISIBLE

        b.historyBtn.setOnClickListener { startActivity(Intent(this, HistoryActivity::class.java)) }
        b.mtnBtn.setOnClickListener { setProcessor("MTN") }
        b.airtelBtn.setOnClickListener { setProcessor("AIRTEL") }

        val digits = mapOf(
            b.key0 to "0", b.key1 to "1", b.key2 to "2", b.key3 to "3", b.key4 to "4",
            b.key5 to "5", b.key6 to "6", b.key7 to "7", b.key8 to "8", b.key9 to "9",
        )
        for ((v, d) in digits) v.setOnClickListener { press(d) }
        b.keyDot.setOnClickListener { press(".") }
        b.keyDel.setOnClickListener { press("del") }
        b.chargeBtn.setOnClickListener { charge() }

        setProcessor("MTN")
        render()
    }

    override fun onResume() {
        super.onResume()
        refreshToday()
        reconcilePending()
    }

    private fun refreshToday() {
        val s = local.todaySummary()
        b.todayLine.text = if (s.count > 0) "Today: ${fmtK(s.totalNgwee.toString())} · ${s.count}" else ""
    }

    /** Re-check any sale whose outcome we never confirmed (network dropped). */
    private fun reconcilePending() {
        lifecycleScope.launch {
            for (s in local.needingReconcile()) {
                try {
                    // Idempotent re-issue: same key returns the existing txn, no double charge.
                    var txn = api.createCollection(s.processor, s.amountNgwee, s.msisdn, null, s.idempotencyKey)
                    var tries = 0
                    while (!txn.isTerminal && tries < 2) { delay(1500); txn = api.getTransaction(txn.id); tries++ }
                    local.upsert(s.copy(
                        serverId = txn.id, status = txn.status, chargeNgwee = txn.charge,
                        totalNgwee = txn.totalAmount, reference = txn.id.take(8).uppercase(),
                        failureReason = txn.failureReason,
                    ))
                } catch (e: ApiException) {
                    if (lockIfRevoked(e)) return@launch
                    // leave for next time
                } catch (_: Exception) { /* still offline — try again later */ }
            }
            refreshToday()
        }
    }

    private fun press(k: String) {
        if (busy) return
        when (k) {
            "." -> if (!typed.contains(".")) typed = if (typed.isEmpty()) "0." else "$typed."
            "del" -> if (typed.isNotEmpty()) typed = typed.dropLast(1)
            else -> {
                val dot = typed.indexOf('.')
                if (dot >= 0 && typed.length - dot - 1 >= 2) return
                if (typed.replace(".", "").length >= 9) return
                typed = if (typed == "0") k else typed + k
            }
        }
        render()
    }

    private fun render() {
        b.amountText.text = typed.ifEmpty { "0" }
        val ngwee = kwachaToNgwee(typed)
        b.chargeBtn.isEnabled = ngwee != null && !busy
        b.chargeBtn.text = if (ngwee != null) "Charge ${fmtK(ngwee)}" else "Charge"
    }

    private fun setProcessor(p: String) {
        processor = p
        styleSeg(b.mtnBtn, p == "MTN")
        styleSeg(b.airtelBtn, p == "AIRTEL")
    }

    private fun styleSeg(tv: TextView, on: Boolean) {
        tv.setBackgroundResource(if (on) R.drawable.bg_seg_on else 0)
        tv.setTextColor(color(if (on) R.color.brand else R.color.slate))
    }

    private fun charge() {
        val amountNgwee = kwachaToNgwee(typed) ?: return
        val msisdn = b.msisdn.text.toString().trim()
        if (!msisdn.matches(Regex("^260\\d{9}$"))) { setStatus("Phone must be 260XXXXXXXXX", true); return }

        setBusy(true)
        setStatus("Sending prompt to $msisdn…", false)
        val idem = UUID.randomUUID().toString()
        val netLabel = if (processor == "AIRTEL") "Airtel Money" else "MTN MoMo"
        // Record the attempt BEFORE the network call, so a crash/blackout never loses it.
        val base = LocalSale(
            idempotencyKey = idem, serverId = "", processor = processor, networkLabel = netLabel,
            msisdn = msisdn, amountNgwee = amountNgwee, chargeNgwee = "0", totalNgwee = amountNgwee,
            status = "PENDING", reference = "", failureReason = null, createdAt = System.currentTimeMillis(),
        )
        local.upsert(base)

        lifecycleScope.launch {
            try {
                var txn = api.createCollection(processor, amountNgwee, msisdn, null, idem)
                local.upsert(base.copy(serverId = txn.id, status = txn.status, reference = txn.id.take(8).uppercase()))
                txn = poll(txn)
                local.upsert(base.copy(
                    serverId = txn.id, status = txn.status, chargeNgwee = txn.charge,
                    totalNgwee = txn.totalAmount, reference = txn.id.take(8).uppercase(), failureReason = txn.failureReason,
                ))
                refreshToday()
                if (txn.isSuccess) {
                    goToReceipt(txn)
                } else {
                    setStatus("${txn.status}${txn.failureReason?.let { " — $it" } ?: ""}", true)
                    setBusy(false)
                }
            } catch (e: ApiException) {
                if (lockIfRevoked(e)) return@launch
                if (e.statusCode in 400..499) {
                    // The gateway rejected it — the charge did not happen.
                    local.upsert(base.copy(status = "FAILED", failureReason = e.message))
                    setStatus(e.message ?: "Failed", true)
                } else {
                    // Server error — outcome unknown; keep it for reconcile.
                    local.upsert(base.copy(status = "UNKNOWN", failureReason = e.message))
                    setStatus("Saved — will confirm when the network is back", true)
                }
                setBusy(false)
            } catch (e: Exception) {
                // Network/timeout — the prompt may have gone out; keep for reconcile.
                local.upsert(base.copy(status = "UNKNOWN", failureReason = "No network"))
                setStatus("Saved — will retry when back online (see History)", true)
                setBusy(false)
            }
        }
    }

    /** Poll the transaction to a terminal state (the gateway re-enquires on read). */
    private suspend fun poll(initial: Txn): Txn {
        var txn = initial
        var tries = 0
        while (!txn.isTerminal && tries < 45) {
            setStatus("Waiting for the customer to approve…", false)
            delay(2000)
            txn = api.getTransaction(txn.id)
            tries++
        }
        return txn
    }

    private fun goToReceipt(txn: Txn) {
        startActivity(Intent(this, ReceiptActivity::class.java).apply {
            putExtra("id", txn.id)
            putExtra("amount", txn.amount)
            putExtra("charge", txn.charge)
            putExtra("total", txn.totalAmount)
            putExtra("msisdn", txn.msisdn)
            putExtra("status", txn.status)
            putExtra("network", if (processor == "AIRTEL") "Airtel Money" else "MTN MoMo")
        })
        // Reset for the next sale.
        typed = ""; b.msisdn.text?.clear(); setBusy(false); setStatus("", false); render()
    }

    private fun setBusy(v: Boolean) {
        busy = v
        b.progress.visibility = if (v) View.VISIBLE else View.GONE
        render()
    }

    private fun setStatus(msg: String, error: Boolean) {
        b.status.text = msg
        b.status.setTextColor(color(if (error) R.color.accent else R.color.slate))
    }

    private fun color(res: Int) = ContextCompat.getColor(this, res)

    private fun kwachaToNgwee(input: String): String? {
        val s = input.trim()
        if (!s.matches(Regex("^\\d+(\\.\\d{1,2})?$"))) return null
        val parts = s.split(".")
        val whole = parts[0].toLongOrNull() ?: return null
        val frac = if (parts.size > 1) parts[1].padEnd(2, '0').toLong() else 0L
        val ngwee = whole * 100 + frac
        return if (ngwee <= 0) null else ngwee.toString()
    }
}
