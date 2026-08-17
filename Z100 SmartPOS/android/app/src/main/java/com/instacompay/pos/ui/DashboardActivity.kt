package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.api.Txn
import com.instacompay.pos.data.LocalTxnStore
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivityDashboardBinding
import com.instacompay.pos.hardware.PrinterService
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.launch

/** Home screen after activation: terminal identity, balance, today's takings,
 *  recent sales, and quick actions. */
class DashboardActivity : AppCompatActivity() {
    private lateinit var b: ActivityDashboardBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val local by lazy { LocalTxnStore(this) }
    private val api by lazy { GatewayApi(store) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(b.root)

        val creds = store.load()
        b.accountLabel.text = creds?.accountNumber?.ifBlank { "Terminal" } ?: "Terminal"
        b.envBadge.visibility = if (creds?.environment == "LIVE") View.GONE else View.VISIBLE

        b.newSaleBtn.setOnClickListener { startActivity(Intent(this, SellActivity::class.java)) }
        b.navSell.setOnClickListener { startActivity(Intent(this, SellActivity::class.java)) }
        b.navItems.setOnClickListener { startActivity(Intent(this, ItemsActivity::class.java)) }
        b.navHistory.setOnClickListener { startActivity(Intent(this, HistoryActivity::class.java)) }
        b.testPrintBtn.setOnClickListener { testPrint() }
        // Phases C–D sections — not built yet.
        val soon = android.view.View.OnClickListener { Toast.makeText(this, "Coming soon", Toast.LENGTH_SHORT).show() }
        b.navDisburse.setOnClickListener(soon)
        b.navSettlements.setOnClickListener(soon)
        b.navReports.setOnClickListener(soon)
    }

    override fun onResume() {
        super.onResume()
        // Today's takings come from the on-device log (instant, offline).
        val s = local.todaySummary()
        b.todayCount.text = s.count.toString()
        b.todayTotal.text = fmtK(s.totalNgwee)
        refreshRemote()
    }

    /** Pull the live balance and recent sales from the gateway (best-effort). */
    private fun refreshRemote() {
        lifecycleScope.launch {
            try {
                // The balance call is our revocation check: a revoked terminal 401s
                // here and gets locked back to activation.
                b.balanceAmount.text = fmtKStr(api.getBalance().floatBalance)
                renderRecent(api.listTransactions(6).items)
            } catch (e: Exception) {
                if (lockIfRevoked(e)) return@launch
                // otherwise offline/transient — keep the last values
            }
        }
    }

    private fun renderRecent(items: List<Txn>) {
        b.recentList.removeAllViews()
        if (items.isEmpty()) {
            b.recentEmpty.visibility = View.VISIBLE
            return
        }
        b.recentEmpty.visibility = View.GONE
        for (t in items) {
            val row = layoutInflater.inflate(R.layout.row_recent, b.recentList, false)
            row.findViewById<TextView>(R.id.rowAmount).text = fmtKStr(t.amount)
            row.findViewById<TextView>(R.id.rowSub).text = "${t.processor} · ${t.msisdn ?: "-"}"
            val st = row.findViewById<TextView>(R.id.rowStatus)
            st.text = t.status
            st.setTextColor(ContextCompat.getColor(this, statusColor(t.status)))
            // Tap a row for reprint / refund (shared with History).
            row.setOnClickListener { TxnActions.show(this, t) { refreshRemote() } }
            b.recentList.addView(row)
        }
    }

    private fun statusColor(status: String): Int = when (status) {
        "SUCCESS" -> R.color.success
        "FAILED", "EXPIRED", "REVERSED" -> R.color.accent
        else -> R.color.slate
    }

    private fun testPrint() {
        lifecycleScope.launch {
            try {
                SdkManager.onHardware { SdkManager.printer().printTestReceipt() }
                Toast.makeText(this@DashboardActivity, "Printed test receipt", Toast.LENGTH_SHORT).show()
            } catch (e: PrinterService.PaperOutException) {
                Toast.makeText(this@DashboardActivity, "Printer out of paper", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Toast.makeText(this@DashboardActivity, "Print error: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun fmtK(ngwee: Long): String = "K%,.2f".format(ngwee / 100.0)
    private fun fmtKStr(ngwee: String): String = fmtK(ngwee.toLongOrNull() ?: 0L)
}
