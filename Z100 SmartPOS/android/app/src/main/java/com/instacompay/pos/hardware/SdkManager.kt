package com.instacompay.pos.hardware

import android.util.Log
import com.zcs.sdk.DriverManager
import com.zcs.sdk.SdkResult
import com.zcs.sdk.Sys
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.withContext

/**
 * The single entry point to the Z100 hardware.
 *
 * Holds ONE [DriverManager] for the whole app, initialises the SDK once, and
 * exposes a coroutine dispatcher backed by the SDK's own single-thread executor.
 * EVERY blocking hardware call (print, searchCard, emvTrans, scanner power, …)
 * must run on [hw] via [onHardware]; the hardware bus is not safe to touch from
 * more than one thread at a time.
 */
object SdkManager {
    private const val TAG = "SdkManager"

    val driver: DriverManager by lazy { DriverManager.getInstance() }
    private val sys: Sys by lazy { driver.getBaseSysDevice() }

    /** Serialised dispatcher for all SDK calls (the SDK's single-thread executor). */
    val hw: CoroutineDispatcher by lazy { driver.getSingleThreadExecutor().asCoroutineDispatcher() }

    @Volatile
    var initialised = false
        private set

    /**
     * Initialise the SDK once. On failure, power the device on and retry once —
     * the exact recovery the vendor demo uses. Blocking; call off the main thread.
     */
    @Synchronized
    fun init(): Boolean {
        if (initialised) return true
        var status = sys.sdkInit()
        if (status != SdkResult.SDK_OK) {
            sys.sysPowerOn()
            try { Thread.sleep(1000) } catch (_: InterruptedException) {}
            status = sys.sdkInit()
        }
        initialised = status == SdkResult.SDK_OK
        Log.i(TAG, "sdkInit status=$status ok=$initialised")
        return initialised
    }

    /**
     * Device serial number, sent to the gateway at activation for per-terminal
     * identification. Reads via Sys.getSN(out); "" if unavailable (optional on
     * the server). Requires the SDK to be initialised — call after [init].
     */
    fun serialNumber(): String {
        val out = arrayOfNulls<String>(1)
        return try {
            if (sys.getSN(out) == SdkResult.SDK_OK) out[0].orEmpty() else ""
        } catch (_: Throwable) {
            ""
        }
    }

    /** Run a blocking SDK block on the serialised hardware dispatcher. */
    suspend fun <T> onHardware(block: () -> T): T = withContext(hw) { block() }

    fun printer(): PrinterService = PrinterService(driver)
    fun scanner(): ScannerHelper = ScannerHelper(driver)
}
