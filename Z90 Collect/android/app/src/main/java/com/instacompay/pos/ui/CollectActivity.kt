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
import android.text.InputType
import android.widget.EditText
import androidx.appcompat.app.AlertDialog
import com.instacompay.pos.api.Txn
import com.instacompay.pos.data.LocalSale
import com.instacompay.pos.data.LocalTxnStore
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.data.Staff
import com.instacompay.pos.data.StaffStore
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
    private val staff by lazy { StaffStore(this) }

    private var typed = ""
    private var processor = "MTN"
    private var busy = false

    private companion object {
        const val FOREGROUND_POLL_TRIES = 12 // ~24s blocking the screen
        const val MAX_POLL_TRIES = 60        // ~2min total, then background reconcile takes over
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityCollectBinding.inflate(layoutInflater)
        setContentView(b.root)

        val c = store.load()
        b.merchantName.text = c?.displayName ?: "InstacomPay"
        b.envBadge.visibility = if (c?.environment == "LIVE") View.GONE else View.VISIBLE

        b.historyBtn.setOnClickListener { startActivity(Intent(this, HistoryActivity::class.java)) }
        b.attendantChip.setOnClickListener { onAttendantTap() }
        b.staffBtn.setOnClickListener { openStaff() }
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
        refreshAttendant()
        reconcilePending()
    }

    // ── Staff / attendant ──
    private val usesStaff: Boolean get() = staff.listStaff().isNotEmpty()

    private fun refreshAttendant() {
        b.attendantChip.text = when {
            !usesStaff -> "Single operator"
            staff.isSignedIn -> "👤 ${staff.currentAttendantName}"
            else -> "Tap to sign in"
        }
    }

    private fun onAttendantTap() {
        if (!usesStaff) { openStaff(); return }
        if (staff.isSignedIn) {
            AlertDialog.Builder(this)
                .setTitle("Signed in as ${staff.currentAttendantName}")
                .setPositiveButton("Switch attendant") { _, _ -> signInFlow() }
                .setNegativeButton("Sign out") { _, _ -> staff.signOut(); refreshAttendant() }
                .show()
        } else signInFlow()
    }

    private fun signInFlow() {
        val roster = staff.listStaff()
        if (roster.isEmpty()) { openStaff(); return }
        AlertDialog.Builder(this)
            .setTitle("Who's on the till?")
            .setItems(roster.map { it.name }.toTypedArray()) { _, i -> pinPrompt(roster[i]) }
            .show()
    }

    private fun pinPrompt(s: Staff) {
        val input = pinInput()
        AlertDialog.Builder(this)
            .setTitle("${s.name} — enter PIN")
            .setView(input)
            .setPositiveButton("Sign in") { _, _ ->
                if (staff.verifyStaff(s.id, input.text.toString())) { staff.signIn(s); refreshAttendant() }
                else toast("Wrong PIN")
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun openStaff() {
        if (!staff.hasManagerPin) { startActivity(Intent(this, StaffActivity::class.java)); return }
        val input = pinInput()
        AlertDialog.Builder(this)
            .setTitle("Manager PIN")
            .setView(input)
            .setPositiveButton("OK") { _, _ ->
                if (staff.verifyManager(input.text.toString())) startActivity(Intent(this, StaffActivity::class.java))
                else toast("Wrong PIN")
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun pinInput() = EditText(this).apply {
        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        hint = "PIN"
    }

    private fun toast(m: String) = android.widget.Toast.makeText(this, m, android.widget.Toast.LENGTH_SHORT).show()

    private fun refreshToday() {
        val s = local.todaySummary()
        b.todayLine.text = if (s.count > 0) "Today: ${fmtK(s.totalNgwee.toString())} · ${s.count}" else ""
    }

    /** Re-check any sale whose outcome we never confirmed (network dropped). */
    private fun reconcilePending() {
        lifecycleScope.launch {
            try { reconcileLocal(api, local) }
            catch (e: ApiException) { if (lockIfRevoked(e)) return@launch }
            catch (_: Exception) { }
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
        if (usesStaff && !staff.isSignedIn) { setStatus("Sign in as an attendant first", true); signInFlow(); return }

        setBusy(true)
        setStatus("Sending prompt to $msisdn…", false)
        val idem = UUID.randomUUID().toString()
        val netLabel = if (processor == "AIRTEL") "Airtel Money" else "MTN MoMo"
        // Record the attempt BEFORE the network call, so a crash/blackout never loses it.
        val base = LocalSale(
            idempotencyKey = idem, serverId = "", processor = processor, networkLabel = netLabel,
            msisdn = msisdn, amountNgwee = amountNgwee, chargeNgwee = "0", totalNgwee = amountNgwee,
            status = "PENDING", reference = "", failureReason = null, createdAt = System.currentTimeMillis(),
            attendant = staff.currentAttendantName.orEmpty(),
        )
        local.upsert(base)

        lifecycleScope.launch {
            var released = false
            try {
                var txn = api.createCollection(processor, amountNgwee, msisdn, null, idem)
                local.upsert(base.copy(serverId = txn.id, status = txn.status, reference = txn.id.take(8).uppercase()))
                // The prompt is on the customer's phone now; the wait is their approval.
                if (!txn.isTerminal) setStatus("Prompt sent — ask the customer to approve on their phone", false)

                var tries = 0
                while (!txn.isTerminal && tries < MAX_POLL_TRIES) {
                    delay(2000)
                    tries++
                    txn = api.getTransaction(txn.id)
                    local.upsert(base.copy(
                        serverId = txn.id, status = txn.status, chargeNgwee = txn.charge,
                        totalNgwee = txn.totalAmount, reference = txn.id.take(8).uppercase(), failureReason = txn.failureReason,
                    ))
                    // Don't freeze the till: after a short wait, free the screen for the
                    // next sale and let this one finish confirming in the background.
                    if (!txn.isTerminal && !released && tries >= FOREGROUND_POLL_TRIES) {
                        released = true
                        releaseForNextSale()
                    }
                }
                refreshToday()
                when {
                    txn.isSuccess && !released -> goToReceipt(txn)
                    txn.isSuccess && released -> toast("Sale to ${base.msisdn} confirmed")
                    !released -> { setStatus("${txn.status}${txn.failureReason?.let { " — $it" } ?: ""}", true); setBusy(false) }
                    // released & not successful: it's in History; don't interrupt the next sale.
                }
            } catch (e: ApiException) {
                if (lockIfRevoked(e)) return@launch
                val failed = e.statusCode in 400..499
                local.upsert(base.copy(status = if (failed) "FAILED" else "UNKNOWN", failureReason = e.message))
                if (!released) {
                    setStatus(if (failed) (e.message ?: "Failed") else "Saved — will confirm when the network is back", true)
                    setBusy(false)
                }
            } catch (e: Exception) {
                // Network/timeout — the prompt may have gone out; keep for reconcile.
                local.upsert(base.copy(status = "UNKNOWN", failureReason = "No network"))
                if (!released) {
                    setStatus("Saved — will retry when back online (see History)", true)
                    setBusy(false)
                }
            }
        }
    }

    /** Stop blocking the screen; the in-flight sale keeps confirming in the background. */
    private fun releaseForNextSale() {
        typed = ""; b.msisdn.text?.clear(); render()
        setBusy(false)
        setStatus("Still pending — it'll confirm on its own. You can start the next sale.", false)
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
