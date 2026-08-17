package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.data.LocalTxnStore
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivityDashboardBinding
import com.instacompay.pos.hardware.PrinterService
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.launch

/** Home screen after activation: terminal identity, today's takings, quick actions. */
class DashboardActivity : AppCompatActivity() {
    private lateinit var b: ActivityDashboardBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val local by lazy { LocalTxnStore(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(b.root)

        val creds = store.load()
        b.accountLabel.text = creds?.accountNumber?.ifBlank { "Terminal" } ?: "Terminal"
        b.envBadge.visibility = if (creds?.environment == "LIVE") View.GONE else View.VISIBLE

        b.newSaleBtn.setOnClickListener { startActivity(Intent(this, SaleActivity::class.java)) }
        b.historyBtn.setOnClickListener { startActivity(Intent(this, HistoryActivity::class.java)) }
        b.scanBtn.setOnClickListener { startActivity(Intent(this, ScanActivity::class.java)) }
        b.testPrintBtn.setOnClickListener { testPrint() }
    }

    override fun onResume() {
        super.onResume()
        val s = local.todaySummary()
        b.todayCount.text = s.count.toString()
        b.todayTotal.text = "K%,.2f".format(s.totalNgwee / 100.0)
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
}
