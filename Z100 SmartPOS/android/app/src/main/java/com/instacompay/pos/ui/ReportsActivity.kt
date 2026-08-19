package com.instacompay.pos.ui

import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.api.ReportSummary
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivityReportsBinding
import kotlinx.coroutines.launch

/** Takings summary for this terminal over a chosen window (today / 7d / 30d). */
class ReportsActivity : AppCompatActivity() {
    private lateinit var b: ActivityReportsBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }
    private var range = "today"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityReportsBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.backBtn.setOnClickListener { finish() }
        b.rangeToday.setOnClickListener { select("today") }
        b.range7d.setOnClickListener { select("7d") }
        b.range30d.setOnClickListener { select("30d") }
        select("today")
    }

    private fun select(r: String) {
        range = r
        styleSeg(b.rangeToday, r == "today")
        styleSeg(b.range7d, r == "7d")
        styleSeg(b.range30d, r == "30d")
        load()
    }

    private fun styleSeg(tv: TextView, on: Boolean) {
        tv.setBackgroundResource(if (on) R.drawable.bg_seg_on else 0)
        tv.setTextColor(color(if (on) R.color.brand else R.color.slate))
    }

    private fun load() {
        b.status.text = "Loading…"
        lifecycleScope.launch {
            try {
                render(api.reportSummary(range))
                b.status.text = ""
            } catch (e: Exception) {
                if (lockIfRevoked(e)) return@launch
                b.status.text = "Error: ${e.message}"
            }
        }
    }

    private fun render(s: ReportSummary) {
        b.grossAmount.text = fmtK(s.gross)
        b.collSub.text = "${s.collectionsCount} ${plural(s.collectionsCount, "sale")}"
        b.netAmount.text = fmtK(s.net)
        b.chargesAmount.text = fmtK(s.charges)
        b.payoutAmount.text = fmtK(s.payoutsTotal)
        b.payoutSub.text = "${s.payoutsCount} ${plural(s.payoutsCount, "payout")}"

        b.railList.removeAllViews()
        b.railEmpty.visibility = if (s.rails.isEmpty()) android.view.View.VISIBLE else android.view.View.GONE
        for (r in s.rails) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(12), dp(12), dp(12), dp(12))
            }
            val name = TextView(this).apply {
                text = railLabel(r.processor); setTextColor(color(R.color.ink)); textSize = 15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            val count = TextView(this).apply {
                text = "${r.count}"; setTextColor(color(R.color.slate)); textSize = 13f
                layoutParams = LinearLayout.LayoutParams(dp(56), LinearLayout.LayoutParams.WRAP_CONTENT)
                gravity = Gravity.CENTER
            }
            val amt = TextView(this).apply {
                text = fmtK(r.gross); setTextColor(color(R.color.ink)); textSize = 15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            }
            row.addView(name); row.addView(count); row.addView(amt)
            b.railList.addView(row)
        }
    }

    private fun railLabel(p: String) = when (p.uppercase()) {
        "MTN" -> "MTN MoMo"
        "AIRTEL" -> "Airtel Money"
        "ZAMTEL" -> "Zamtel Kwacha"
        else -> p
    }

    private fun plural(n: Int, word: String) = if (n == 1) word else "${word}s"
    private fun color(res: Int) = ContextCompat.getColor(this, res)
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun fmtK(ngwee: String) = "K%,.2f".format((ngwee.toLongOrNull() ?: 0L) / 100.0)
}
