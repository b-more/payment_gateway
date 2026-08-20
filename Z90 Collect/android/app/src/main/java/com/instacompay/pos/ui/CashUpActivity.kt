package com.instacompay.pos.ui

import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.data.LocalSale
import com.instacompay.pos.data.LocalTxnStore
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.data.StaffStore
import com.instacompay.pos.databinding.ActivityCashupBinding
import com.instacompay.pos.hardware.CashUpData
import com.instacompay.pos.hardware.CashUpLine
import com.instacompay.pos.hardware.PrinterService
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Shift cash-up: takings since the shift started, by attendant and network. */
class CashUpActivity : AppCompatActivity() {
    private lateinit var b: ActivityCashupBinding
    private val local by lazy { LocalTxnStore(this) }
    private val staff by lazy { StaffStore(this) }
    private val creds by lazy { SecureCredentialStore(this) }
    private val time = SimpleDateFormat("dd MMM HH:mm", Locale.US)

    private var attendants: List<CashUpLine> = emptyList()
    private var networks: List<CashUpLine> = emptyList()
    private var totalCount = 0
    private var grandTotalNgwee = 0L
    private var shiftStart = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityCashupBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.backBtn.setOnClickListener { finish() }
        b.printBtn.setOnClickListener { print(close = false) }
        b.closeBtn.setOnClickListener { confirmClose() }
        compute()
        render()
    }

    private fun compute() {
        shiftStart = staff.shiftStartMs()
        val sales = local.successSince(shiftStart)
        totalCount = sales.size
        grandTotalNgwee = sales.sumOf { it.totalNgwee.toLongOrNull() ?: 0L }
        attendants = groupBy(sales) { it.attendant.ifBlank { "Unassigned" } }
        networks = groupBy(sales) { it.networkLabel.ifBlank { it.processor } }
    }

    private fun groupBy(sales: List<LocalSale>, key: (LocalSale) -> String): List<CashUpLine> {
        val map = LinkedHashMap<String, Pair<Int, Long>>()
        for (s in sales) {
            val k = key(s)
            val (c, t) = map[k] ?: (0 to 0L)
            map[k] = (c + 1) to (t + (s.totalNgwee.toLongOrNull() ?: 0L))
        }
        return map.entries.sortedByDescending { it.value.second }
            .map { CashUpLine(it.key, it.value.first, fmtK(it.value.second.toString())) }
    }

    private fun render() {
        b.period.text = "Since ${time.format(Date(shiftStart))}  →  now"
        b.grandTotal.text = fmtK(grandTotalNgwee.toString())
        b.countLine.text = "$totalCount ${if (totalCount == 1) "sale" else "sales"}"
        fill(b.attendantList, attendants)
        fill(b.networkList, networks)
    }

    private fun fill(container: LinearLayout, lines: List<CashUpLine>) {
        container.removeAllViews()
        if (lines.isEmpty()) {
            container.addView(TextView(this).apply {
                text = "No sales yet."; setTextColor(color(R.color.slate)); textSize = 14f; setPadding(dp(14), dp(14), dp(14), dp(14))
            })
            return
        }
        for (l in lines) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
            }
            val left = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            left.addView(TextView(this).apply { text = l.name; setTextColor(color(R.color.ink)); textSize = 15f; setTypeface(typeface, android.graphics.Typeface.BOLD) })
            left.addView(TextView(this).apply { text = "${l.count} ${if (l.count == 1) "sale" else "sales"}"; setTextColor(color(R.color.slate)); textSize = 12f })
            row.addView(left)
            row.addView(TextView(this).apply { text = l.total; setTextColor(color(R.color.ink)); textSize = 15f; setTypeface(typeface, android.graphics.Typeface.BOLD) })
            container.addView(row)
        }
    }

    private fun confirmClose() {
        AlertDialog.Builder(this)
            .setTitle("Close shift?")
            .setMessage("Prints the cash-up, signs the attendant out, and starts a fresh shift.")
            .setPositiveButton("Print & close") { _, _ -> print(close = true) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun print(close: Boolean) {
        val data = CashUpData(
            merchantName = creds.load()?.displayName ?: "InstacomPay",
            period = "Since ${time.format(Date(shiftStart))}",
            printedAt = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date()),
            attendants = attendants,
            networks = networks,
            totalCount = totalCount,
            grandTotal = fmtK(grandTotalNgwee.toString()),
        )
        b.printBtn.isEnabled = false; b.closeBtn.isEnabled = false
        lifecycleScope.launch {
            try {
                SdkManager.onHardware { SdkManager.printer().printCashUp(data) }
                if (close) { staff.closeShift(); toast("Shift closed"); finish() }
                else toast("Printed")
            } catch (e: PrinterService.PaperOutException) {
                toast("Printer out of paper")
            } catch (e: Exception) {
                toast("Print error: ${e.message}")
            } finally {
                b.printBtn.isEnabled = true; b.closeBtn.isEnabled = true
            }
        }
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
    private fun color(res: Int) = ContextCompat.getColor(this, res)
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
