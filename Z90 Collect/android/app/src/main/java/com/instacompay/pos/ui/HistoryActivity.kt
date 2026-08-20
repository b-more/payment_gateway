package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.instacompay.pos.R
import com.instacompay.pos.data.LocalSale
import com.instacompay.pos.data.LocalTxnStore
import com.instacompay.pos.databinding.ActivityHistoryBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** On-device sales log. Tap a successful sale to preview + reprint its receipt. */
class HistoryActivity : AppCompatActivity() {
    private lateinit var b: ActivityHistoryBinding
    private val local by lazy { LocalTxnStore(this) }
    private val time = SimpleDateFormat("dd MMM, HH:mm", Locale.US)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityHistoryBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.backBtn.setOnClickListener { finish() }
    }

    override fun onResume() {
        super.onResume()
        render(local.recent())
        val s = local.todaySummary()
        b.summary.text = if (s.count > 0) "Today ${fmtK(s.totalNgwee.toString())}" else ""
    }

    private fun render(items: List<LocalSale>) {
        b.list.removeAllViews()
        b.empty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
        for (s in items) b.list.addView(rowFor(s))
    }

    private fun rowFor(s: LocalSale): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(13), dp(16), dp(13))
            setBackgroundColor(color(R.color.surface))
        }
        val left = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        left.addView(TextView(this).apply {
            text = fmtK(s.totalNgwee.ifBlank { s.amountNgwee })
            setTextColor(color(R.color.ink)); textSize = 16f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        })
        left.addView(TextView(this).apply {
            text = "${s.networkLabel} · ${s.msisdn} · ${time.format(Date(s.createdAt))}"
            setTextColor(color(R.color.slate)); textSize = 12f
        })
        val chip = TextView(this).apply {
            text = chipText(s)
            textSize = 11f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setTextColor(chipColor(s))
            setPadding(dp(10), dp(4), dp(10), dp(4))
            setBackgroundResource(chipBg(s))
        }
        row.addView(left); row.addView(chip)

        if (s.isSuccess) {
            row.isClickable = true; row.isFocusable = true
            row.setOnClickListener { openReceipt(s) }
        }

        val wrap = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        wrap.addView(row)
        wrap.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
            setBackgroundColor(color(R.color.line))
        })
        return wrap
    }

    private fun openReceipt(s: LocalSale) {
        startActivity(Intent(this, ReceiptActivity::class.java).apply {
            putExtra("id", s.serverId)
            putExtra("amount", s.amountNgwee)
            putExtra("charge", s.chargeNgwee)
            putExtra("total", s.totalNgwee)
            putExtra("msisdn", s.msisdn)
            putExtra("status", s.status)
            putExtra("network", s.networkLabel)
            putExtra("reprint", true)
        })
    }

    private fun chipText(s: LocalSale) = when (s.status) {
        "SUCCESS" -> "PAID"
        "UNKNOWN", "PENDING", "PROCESSING" -> "PENDING"
        else -> s.status
    }

    private fun chipColor(s: LocalSale) = when {
        s.isSuccess -> color(R.color.success)
        s.needsReconcile -> android.graphics.Color.parseColor("#B45309")
        else -> color(R.color.accent)
    }

    private fun chipBg(s: LocalSale) = when {
        s.isSuccess -> R.drawable.bg_seg_on
        s.needsReconcile -> R.drawable.bg_badge_amber
        else -> R.drawable.bg_seg_on
    }

    private fun color(res: Int) = ContextCompat.getColor(this, res)
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
