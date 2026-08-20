package com.instacompay.pos.config

import com.instacompay.pos.BuildConfig

/** Static app configuration, sourced from BuildConfig (set in app/build.gradle). */
object AppConfig {
    val baseUrl: String get() = BuildConfig.GATEWAY_BASE_URL
    val cardEnabled: Boolean get() = BuildConfig.CARD_ENABLED
}
