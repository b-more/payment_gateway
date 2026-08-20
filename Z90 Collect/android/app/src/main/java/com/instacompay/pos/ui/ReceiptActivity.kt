package com.instacompay.pos.ui

import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.api.Txn
import com.instacompay.pos.databinding.ActivityReceiptBinding
import com.instacompay.pos.hardware.PrinterService
import com.instacompay.pos.hardware.ReceiptData
import com.instacompay.pos.hardware.SdkManager
import kotlinx.coroutines.launch

/** Shows an on-screen receipt PREVIEW; prints only when the operator taps Print. */
class ReceiptActivity : AppCompatActivity() {
    private lateinit var b: ActivityReceiptBinding
    private lateinit var txn: Txn
    private lateinit var network: String
    private var printedOnce = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityReceiptBinding.inflate(layoutInflater)
        setContentView(b.root)

        network = intent.getStringExtra("network") ?: "MTN MoMo"
        txn = Txn(
            id = intent.getStringExtra("id").orEmpty(),
            type = "COLLECTION",
            processor = "",
            msisdn = intent.getStringExtra("msisdn"),
            amount = intent.getStringExtra("amount") ?: "0",
            charge = intent.getStringExtra("charge") ?: "0",
            netAmount = "0",
            totalAmount = intent.getStringExtra("total") ?: "0",
            status = intent.getStringExtra("status") ?: "SUCCESS",
            failureReason = null,
            collectionReference = null,
            environment = "LIVE",
        )

        b.amountPaid.text = fmtK(txn.totalAmount)

        // Opened from History → a reprint of an existing sale.
        printedOnce = intent.getBooleanExtra("reprint", false)

        // Build the receipt once; the preview and the printout come from the same data.
        renderPreview(buildReceipt(this, txn, network, reprint = printedOnce))
        if (printedOnce) b.printBtn.text = "Print again"

        b.printBtn.setOnClickListener { print() }
        b.newSaleBtn.setOnClickListener { finish() }
    }

    private fun print() {
        b.printBtn.isEnabled = false
        val receipt = buildReceipt(this, txn, network, reprint = printedOnce)
        lifecycleScope.launch {
            try {
                SdkManager.onHardware { SdkManager.printer().printSaleReceipt(receipt) }
                printedOnce = true
                b.printBtn.text = "Print again"
                toast("Printing…")
            } catch (e: PrinterService.PaperOutException) {
                toast("Printer out of paper")
            } catch (e: Exception) {
                toast("Print error: ${e.message}")
            } finally {
                b.printBtn.isEnabled = true
            }
        }
    }

    // ── On-screen paper preview (mirrors PrinterService.printSaleReceipt) ──
    private fun renderPreview(r: ReceiptData) {
        val p = b.receiptPaper
        p.removeAllViews()

        r.logo?.let {
            val img = ImageView(this)
            val w = dp(150)
            val h = (it.height.toFloat() / it.width * w).toInt().coerceAtLeast(1)
            img.layoutParams = LinearLayout.LayoutParams(w, h).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = dp(8) }
            img.adjustViewBounds = true
            img.setImageBitmap(it)
            p.addView(img)
        }

        center(r.merchantName, 16f, bold = true, ink = true)
        for (line in r.addressLines) if (line.isNotBlank()) center(line, 12f)
        if (r.merchantPhone.isNotBlank()) center("Tel: ${r.merchantPhone}", 12f)
        if (r.tpin.isNotBlank()) center("TPIN: ${r.tpin}", 13f, bold = true, ink = true)
        if (r.registrationNumber.isNotBlank()) center("Reg No: ${r.registrationNumber}", 11f)

        divider('=')
        center(if (r.reprint) "SALES RECEIPT (REPRINT)" else "SALES RECEIPT", 13f, bold = true, ink = true)
        center(r.timestamp, 12f)
        divider('-')

        row("Amount", r.amount)
        if (r.charge != "K0.00") row("Charge", r.charge)
        row("TOTAL", r.total, bold = true)
        divider('-')
        row("Paid by", r.network)
        row("Phone", r.msisdn)
        row("Status", r.status)
        row("Ref", r.reference)
        divider('-')

        center("A QR to verify this receipt", 11f)
        center("is printed on the paper copy.", 11f)
        space(6)
        center("Thank you", 13f, bold = true, ink = true)
        center("Powered by InstacomPay", 10f)
    }

    private fun center(text: String, size: Float, bold: Boolean = false, ink: Boolean = false) {
        b.receiptPaper.addView(TextView(this).apply {
            this.text = text
            textSize = size
            typeface = Typeface.create(Typeface.MONOSPACE, if (bold) Typeface.BOLD else Typeface.NORMAL)
            setTextColor(color(if (ink || bold) R.color.ink else R.color.slate))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        })
    }

    private fun row(label: String, value: String, bold: Boolean = false) {
        val rowV = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(2) }
        }
        val tf = Typeface.create(Typeface.MONOSPACE, if (bold) Typeface.BOLD else Typeface.NORMAL)
        rowV.addView(TextView(this).apply {
            text = label; textSize = if (bold) 13f else 12.5f; typeface = tf
            setTextColor(color(R.color.slate))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        rowV.addView(TextView(this).apply {
            text = value; textSize = if (bold) 13f else 12.5f; typeface = tf
            setTextColor(color(R.color.ink)); gravity = Gravity.END
        })
        b.receiptPaper.addView(rowV)
    }

    private fun divider(ch: Char) {
        b.receiptPaper.addView(TextView(this).apply {
            text = ch.toString().repeat(34)
            typeface = Typeface.MONOSPACE
            textSize = 12f
            setTextColor(color(R.color.line))
            maxLines = 1
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(5); bottomMargin = dp(5) }
        })
    }

    private fun space(h: Int) {
        b.receiptPaper.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(h))
        })
    }

    private fun color(res: Int) = ContextCompat.getColor(this, res)
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
