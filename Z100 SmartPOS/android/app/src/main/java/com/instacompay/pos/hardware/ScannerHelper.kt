package com.instacompay.pos.hardware

import com.zcs.sdk.DriverManager
import com.zcs.sdk.HQrsanner

/**
 * QR / barcode scanner control.
 *
 * The Z100 scanner behaves as an HID keyboard: a decoded scan is injected as text
 * into the currently focused input field — there is NO decode callback in this
 * SDK. So the scan UI hosts a focused (hidden) EditText and reads its committed
 * value; this helper only powers/triggers the scanner.
 */
class ScannerHelper(driver: DriverManager) {
    private val scanner: HQrsanner = driver.getHQrsannerDriver()

    fun powerOn() {
        scanner.QRScanerCtrl(ON)
        scanner.QRScanerPowerCtrl(OFF)
        sleep()
        scanner.QRScanerPowerCtrl(ON)
    }

    /** Fire a single scan attempt. */
    fun trigger() {
        scanner.QRScanerCtrl(ON)
        sleep()
        scanner.QRScanerCtrl(OFF)
    }

    fun powerOff() {
        scanner.QRScanerPowerCtrl(OFF)
    }

    private fun sleep() { try { Thread.sleep(10) } catch (_: InterruptedException) {} }

    private companion object {
        const val ON: Byte = 1
        const val OFF: Byte = 0
    }
}
