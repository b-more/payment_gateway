package com.instacompay.pos.hardware

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.text.Layout
import com.zcs.sdk.DriverManager
import com.zcs.sdk.Printer
import com.zcs.sdk.SdkResult
import com.zcs.sdk.print.PrnStrFormat
import com.zcs.sdk.print.PrnTextFont
import com.zcs.sdk.print.PrnTextStyle

/**
 * Thermal receipt printing. Content is appended line-by-line with a [PrnStrFormat]
 * and flushed with setPrintStart(). Always constructed from the shared driver and
 * called inside [SdkManager.onHardware].
 */
class PrinterService(driver: DriverManager) {
    private val printer: Printer = driver.getPrinter()

    class PaperOutException : Exception("printer is out of paper")

    /** Self-test — also reports whether this unit has a hardware cutter. */
    fun printTestReceipt() {
        ensureReady()
        printer.setPrintAppendString("InstacomPay POS", fmt(30, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.BOLD))
        printer.setPrintAppendString("Printer self-test", fmt(24, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.NORMAL))
        printer.setPrintAppendString("--------------------------------", body())
        printer.setPrintAppendString("If you can read this line,", body())
        printer.setPrintAppendString("the printer is working.", body())
        printer.setPrintAppendString("Cutter supported: " + (if (printer.isSupportCutter) "YES" else "NO"), body())
        printer.setPrintLine(4)
        printer.setPrintStart()
        cut()
    }

    /** Receipt for a completed sale (or a REPRINT). */
    fun printSaleReceipt(r: ReceiptData) {
        ensureReady()

        r.logo?.let { printer.setPrintAppendBitmap(prepLogo(it), Layout.Alignment.ALIGN_CENTER) }

        printer.setPrintAppendString(r.merchantName, fmt(30, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.BOLD))
        if (r.branch.isNotBlank()) printer.setPrintAppendString(r.branch, fmt(22, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.NORMAL))
        if (r.reprint) printer.setPrintAppendString("*** REPRINT ***", fmt(22, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.BOLD))
        printer.setPrintAppendString("SALE RECEIPT", fmt(20, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.NORMAL))
        printer.setPrintAppendString(r.timestamp, fmt(20, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.NORMAL))

        printer.setPrintAppendString("--------------------------------", body())
        row("Amount", r.amount)
        if (r.charge != "K0.00") row("Charge", r.charge)
        row("Total", r.total, big = true)
        printer.setPrintAppendString("--------------------------------", body())
        row("Phone", r.msisdn)
        row("Network", r.network)
        row("Status", r.status)
        row("Reference", r.reference)
        printer.setPrintLine(1)

        r.qrData?.let {
            printer.setPrintAppendQRCode(it, 220, 220, Layout.Alignment.ALIGN_CENTER)
            printer.setPrintAppendString("Scan to view this receipt", fmt(20, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.NORMAL))
        }
        printer.setPrintLine(1)
        printer.setPrintAppendString("Thank you", fmt(24, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.BOLD))
        printer.setPrintAppendString("Powered by InstacomPay", fmt(18, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.NORMAL))
        printer.setPrintLine(5)
        printer.setPrintStart()
        cut()
    }

    /** Two-column label/value row (label left, value right-aligned). */
    private fun row(label: String, value: String, big: Boolean = false) {
        val size = if (big) 26 else 24
        val style = if (big) PrnTextStyle.BOLD else PrnTextStyle.NORMAL
        printer.setPrintAppendStrings(
            arrayOf(label, value),
            intArrayOf(1, 2),
            arrayOf(fmt(size, Layout.Alignment.ALIGN_NORMAL, style), fmt(size, Layout.Alignment.ALIGN_OPPOSITE, style)),
        )
    }

    private fun body(): PrnStrFormat = fmt(24, Layout.Alignment.ALIGN_NORMAL, PrnTextStyle.NORMAL)

    private fun ensureReady() {
        if (printer.getPrinterStatus() == SdkResult.SDK_PRN_STATUS_PAPEROUT) throw PaperOutException()
    }

    /**
     * Cut the paper. Called unconditionally (as the vendor demo's post-print cut
     * does) — isSupportCutter() is unreliable on some units. A no-op where there
     * is no cutter (then the paper is torn on the tear bar; the extra feed above
     * clears the last line).
     */
    private fun cut() {
        printer.openPrnCutter(1.toByte())
    }

    /** Flatten the logo onto white and scale to the paper width for clean printing. */
    private fun prepLogo(src: Bitmap, targetW: Int = 360): Bitmap {
        val ratio = targetW.toFloat() / src.width
        val h = (src.height * ratio).toInt().coerceAtLeast(1)
        val out = Bitmap.createBitmap(targetW, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        canvas.drawColor(Color.WHITE)
        canvas.drawBitmap(Bitmap.createScaledBitmap(src, targetW, h, true), 0f, 0f, null)
        return out
    }

    private fun fmt(size: Int, ali: Layout.Alignment, style: PrnTextStyle): PrnStrFormat {
        val f = PrnStrFormat()
        f.setTextSize(size)
        f.setAli(ali)
        f.setStyle(style)
        f.setFont(PrnTextFont.SANS_SERIF)
        return f
    }
}

data class ReceiptData(
    val merchantName: String,
    val branch: String,
    val timestamp: String,
    val amount: String,
    val charge: String,
    val total: String,
    val msisdn: String,
    val network: String,
    val status: String,
    val reference: String,
    val qrData: String? = null,
    val logo: Bitmap? = null,
    val reprint: Boolean = false,
)
