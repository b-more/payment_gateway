package com.instacompay.pos

import android.app.Application
import com.instacompay.pos.hardware.SdkManager
import kotlin.concurrent.thread

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // sdkInit() is blocking — bring the hardware up off the main thread at
        // startup so the first screen is responsive.
        thread(name = "sdk-init") { SdkManager.init() }
    }
}
