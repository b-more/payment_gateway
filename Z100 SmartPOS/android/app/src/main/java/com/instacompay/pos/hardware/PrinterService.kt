package com.instacompay.pos.hardware

import android.text.Layout
import com.zcs.sdk.DriverManager
import com.zcs.sdk.Printer
import com.zcs.sdk.SdkResult
import com.zcs.sdk.print.PrnStrFormat
import com.zcs.sdk.print.PrnTextFont
import com.zcs.sdk.print.PrnTextStyle

/**
 * Thermal receipt printing. Content is appended line-by-line with a [PrnStrFormat]
 * and flushed to paper with a single setPrintStart(). Always constructed from the
 * shared [SdkManager.driver]; call every method inside [SdkManager.onHardware].
 */
class PrinterService(driver: DriverManager) {
    private val printer: Printer = driver.getPrinter()

    class PaperOutException : Exception("printer is out of paper")

    /** Minimal self-test receipt — validate the printer before wiring the network. */
    fun printTestReceipt() {
        ensureReady()
        printer.setPrintAppendString("InstacomPay POS", fmt(30, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.BOLD))
        printer.setPrintAppendString("Printer self-test", fmt(24, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.NORMAL))
        printer.setPrintAppendString("--------------------------------", body())
        printer.setPrintAppendString("If you can read this line,", body())
        printer.setPrintAppendString("the printer is working.", body())
        printer.setPrintLine(3)
        printer.setPrintStart()
        cut()
    }

    /** Receipt for a completed sale (or a REPRINT). */
    fun printSaleReceipt(r: ReceiptData) {
        ensureReady()
        printer.setPrintAppendString(r.merchantName, fmt(30, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.BOLD))
        if (r.reprint) printer.setPrintAppendString("*** REPRINT ***", fmt(22, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.BOLD))
        printer.setPrintAppendString(r.timestamp, fmt(22, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.NORMAL))
        printer.setPrintAppendString("--------------------------------", body())
        row("Amount", r.amount)
        row("Charge", r.charge)
        row("Total", r.total, bold = true)
        printer.setPrintAppendString("--------------------------------", body())
        row("Phone", r.msisdn)
        row("Status", r.status)
        row("Ref", r.reference)
        printer.setPrintLine(1)
        r.qrData?.let { printer.setPrintAppendQRCode(it, 240, 240, Layout.Alignment.ALIGN_CENTER) }
        printer.setPrintAppendString("Thank you", fmt(22, Layout.Alignment.ALIGN_CENTER, PrnTextStyle.NORMAL))
        printer.setPrintLine(4)
        printer.setPrintStart()
        cut()
    }

    /**
     * Cut the paper after a print. Called unconditionally (as the vendor demo's
     * post-print cut does) — isSupportCutter() reports false on many Z100 units
     * even when the cutter is fitted, so gating on it wrongly skips the cut. On a
     * unit with no cutter this is a harmless no-op.
     */
    private fun cut() {
        printer.openPrnCutter(1.toByte())
    }

    /** Two-column label/value row (label left, value right-aligned). */
    private fun row(label: String, value: String, bold: Boolean = false) {
        val style = if (bold) PrnTextStyle.BOLD else PrnTextStyle.NORMAL
        printer.setPrintAppendStrings(
            arrayOf(label, value),
            intArrayOf(1, 2),
            arrayOf(
                fmt(24, Layout.Alignment.ALIGN_NORMAL, style),
                fmt(24, Layout.Alignment.ALIGN_OPPOSITE, style),
            ),
        )
    }

    private fun body(): PrnStrFormat = fmt(24, Layout.Alignment.ALIGN_NORMAL, PrnTextStyle.NORMAL)

    private fun ensureReady() {
        if (printer.getPrinterStatus() == SdkResult.SDK_PRN_STATUS_PAPEROUT) throw PaperOutException()
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
    val timestamp: String,
    val amount: String,
    val charge: String,
    val total: String,
    val msisdn: String,
    val status: String,
    val reference: String,
    val qrData: String? = null,
    val reprint: Boolean = false,
)
