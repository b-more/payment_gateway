package com.instacompay.pos.ui

import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.api.Settlement
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivitySettlementsBinding
import kotlinx.coroutines.launch

/** Read-only view of settlements (the merchant's float being paid out to their bank). */
class SettlementsActivity : AppCompatActivity() {
    private lateinit var b: ActivitySettlementsBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivitySettlementsBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.backBtn.setOnClickListener { finish() }
        load()
    }

    private fun load() {
        b.status.text = "Loading…"
        lifecycleScope.launch {
            try {
                render(api.listSettlements())
            } catch (e: Exception) {
                if (lockIfRevoked(e)) return@launch
                b.status.text = "Error: ${e.message}"
            }
        }
    }

    private fun render(items: List<Settlement>) {
        var settled = 0L
        var pending = 0L
        for (s in items) {
            val n = s.amount.toLongOrNull() ?: 0L
            when (s.status) {
                "SETTLED" -> settled += n
                "PENDING" -> pending += n
            }
        }
        b.settledTotal.text = fmtK(settled)
        b.pendingTotal.text = fmtK(pending)
        b.status.text = if (items.isEmpty()) "No settlements yet. Payouts appear here once your collections are settled to your bank." else ""

        b.list.removeAllViews()
        for (s in items) b.list.addView(rowFor(s))
    }

    private fun rowFor(s: Settlement): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundResource(R.drawable.bg_card)
            setPadding(dp(16), dp(14), dp(16), dp(14))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(8) }
        }
        val left = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        left.addView(TextView(this).apply {
            text = fmtK(s.amount); setTextColor(color(R.color.ink)); textSize = 17f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        })
        left.addView(TextView(this).apply {
            text = dateLabel(s); setTextColor(color(R.color.slate)); textSize = 12f
        })
        val chip = TextView(this).apply {
            text = s.status
            textSize = 12f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            if (s.status == "PENDING") setTextColor(android.graphics.Color.parseColor("#B45309"))
            else setTextColor(color(statusColor(s.status)))
            setPadding(dp(10), dp(5), dp(10), dp(5))
            setBackgroundResource(chipBg(s.status))
        }
        row.addView(left); row.addView(chip)
        return row
    }

    private fun dateLabel(s: Settlement): String {
        val d = (s.settledAt ?: s.createdAt).take(10)
        return if (s.status == "SETTLED" && s.settledAt != null) "Settled $d" else "Created $d"
    }

    private fun statusColor(status: String) = when (status) {
        "SETTLED" -> R.color.success
        "FAILED" -> R.color.accent
        else -> R.color.brand
    }

    private fun chipBg(status: String) = when (status) {
        "FAILED" -> R.drawable.bg_badge
        "PENDING" -> R.drawable.bg_badge_amber
        else -> R.drawable.bg_nav_on
    }

    private fun color(res: Int) = ContextCompat.getColor(this, res)
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun fmtK(ngwee: Long) = "K%,.2f".format(ngwee / 100.0)
    private fun fmtK(ngwee: String) = fmtK(ngwee.toLongOrNull() ?: 0L)
}
