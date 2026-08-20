package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.api.ApiException
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.data.LocalSale
import com.instacompay.pos.data.LocalTxnStore
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.data.StaffStore
import com.instacompay.pos.databinding.ActivityDashboardBinding
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Home screen: balance, today's takings, pending flag, attendant, recent sales. */
class DashboardActivity : AppCompatActivity() {
    private lateinit var b: ActivityDashboardBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }
    private val local by lazy { LocalTxnStore(this) }
    private val staff by lazy { StaffStore(this) }
    private val time = SimpleDateFormat("HH:mm", Locale.US)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(b.root)

        val c = store.load()
        b.merchantName.text = c?.displayName ?: "InstacomPay"
        b.branchLine.text = listOf(c?.branch.orEmpty(), c?.accountNumber.orEmpty()).filter { it.isNotBlank() }.joinToString(" · ")
        b.envBadge.visibility = if (c?.environment == "LIVE") View.GONE else View.VISIBLE

        b.newSaleBtn.setOnClickListener { startActivity(Intent(this, CollectActivity::class.java)) }
        b.seeAll.setOnClickListener { startActivity(Intent(this, HistoryActivity::class.java)) }
        b.pendingBanner.setOnClickListener { startActivity(Intent(this, HistoryActivity::class.java)) }
        b.staffBtn.setOnClickListener { openStaffGated(staff) }
        b.attendantChip.setOnClickListener { onAttendantTap() }
    }

    override fun onResume() {
        super.onResume()
        renderLocal()
        refreshAttendant()
        loadBalanceAndReconcile()
    }

    // ── Local (instant, offline) ──
    private fun renderLocal() {
        val s = local.todaySummary()
        b.todayTotal.text = fmtK(s.totalNgwee.toString())
        b.todayCount.text = "${s.count} ${if (s.count == 1) "collection" else "collections"}"

        // Today by network
        val startOfToday = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val byNet = LinkedHashMap<String, Long>()
        for (sale in local.successSince(startOfToday)) {
            val k = sale.networkLabel.ifBlank { sale.processor }
            byNet[k] = (byNet[k] ?: 0L) + (sale.totalNgwee.toLongOrNull() ?: 0L)
        }
        b.netBreakdown.removeAllViews()
        for ((net, amt) in byNet.entries.sortedByDescending { it.value }) {
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            row.addView(TextView(this).apply {
                text = net; setTextColor(color(R.color.slate)); textSize = 13f
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            row.addView(TextView(this).apply { text = fmtK(amt.toString()); setTextColor(color(R.color.ink)); textSize = 13f; setTypeface(typeface, android.graphics.Typeface.BOLD) })
            b.netBreakdown.addView(row)
        }

        val pending = local.needingReconcile().size
        b.pendingBanner.visibility = if (pending > 0) View.VISIBLE else View.GONE
        if (pending > 0) b.pendingBanner.text = "⚠ $pending ${if (pending == 1) "sale" else "sales"} awaiting confirmation — tap to review"

        renderRecent(local.recent(6))
    }

    private fun renderRecent(items: List<LocalSale>) {
        b.recentList.removeAllViews()
        b.recentEmpty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
        for (s in items) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
            }
            val left = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            left.addView(TextView(this).apply {
                text = fmtK(s.totalNgwee.ifBlank { s.amountNgwee }); setTextColor(color(R.color.ink)); textSize = 15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            })
            left.addView(TextView(this).apply {
                text = "${s.networkLabel} · ${time.format(Date(s.createdAt))}"; setTextColor(color(R.color.slate)); textSize = 12f
            })
            val chip = TextView(this).apply {
                text = if (s.isSuccess) "PAID" else if (s.needsReconcile) "PENDING" else s.status
                textSize = 11f; setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(if (s.isSuccess) color(R.color.success) else if (s.needsReconcile) android.graphics.Color.parseColor("#B45309") else color(R.color.accent))
            }
            row.addView(left); row.addView(chip)
            if (s.isSuccess) {
                row.isClickable = true; row.isFocusable = true
                row.setOnClickListener {
                    startActivity(Intent(this, ReceiptActivity::class.java).apply {
                        putExtra("id", s.serverId); putExtra("amount", s.amountNgwee); putExtra("charge", s.chargeNgwee)
                        putExtra("total", s.totalNgwee); putExtra("msisdn", s.msisdn); putExtra("status", s.status)
                        putExtra("network", s.networkLabel); putExtra("reprint", true)
                    })
                }
            }
            b.recentList.addView(row)
            b.recentList.addView(View(this).apply {
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)); setBackgroundColor(color(R.color.line))
            })
        }
    }

    // ── Remote (best-effort) ──
    private fun loadBalanceAndReconcile() {
        lifecycleScope.launch {
            try {
                b.balanceText.text = fmtK(api.getBalance().floatBalance)
            } catch (e: Exception) {
                if (lockIfRevoked(e)) return@launch
            }
            // Confirm any sale whose outcome we never saw (idempotent — no double charge).
            var changed = false
            for (s in local.needingReconcile()) {
                try {
                    var txn = api.createCollection(s.processor, s.amountNgwee, s.msisdn, null, s.idempotencyKey)
                    var tries = 0
                    while (!txn.isTerminal && tries < 2) { delay(1500); txn = api.getTransaction(txn.id); tries++ }
                    local.upsert(s.copy(serverId = txn.id, status = txn.status, chargeNgwee = txn.charge, totalNgwee = txn.totalAmount, reference = txn.id.take(8).uppercase(), failureReason = txn.failureReason))
                    changed = true
                } catch (e: ApiException) {
                    if (lockIfRevoked(e)) return@launch
                } catch (_: Exception) { /* still offline */ }
            }
            if (changed) renderLocal()
        }
    }

    // ── Staff ──
    private val usesStaff: Boolean get() = staff.listStaff().isNotEmpty()

    private fun refreshAttendant() {
        b.attendantChip.text = when {
            !usesStaff -> "Single operator"
            staff.isSignedIn -> "👤 ${staff.currentAttendantName}"
            else -> "Tap to sign in an attendant"
        }
    }

    private fun onAttendantTap() {
        if (!usesStaff) { openStaffGated(staff); return }
        if (staff.isSignedIn) {
            androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Signed in as ${staff.currentAttendantName}")
                .setPositiveButton("Switch attendant") { _, _ -> promptSignIn(staff) { refreshAttendant() } }
                .setNegativeButton("Sign out") { _, _ -> staff.signOut(); refreshAttendant() }
                .show()
        } else promptSignIn(staff) { refreshAttendant() }
    }

    private fun color(res: Int) = ContextCompat.getColor(this, res)
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
