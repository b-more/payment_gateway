package com.instacompay.pos.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.instacompay.pos.api.GatewayApi
import java.util.Collections

/**
 * In-memory cache for product photos so the Sell grid and Items list don't
 * re-fetch the same image on every re-render. A cached null is a known "no
 * image" (avoids a repeat 404). Cleared/invalidated when the catalog changes.
 */
object ProductImages {
    private val cache = Collections.synchronizedMap(HashMap<String, Bitmap?>())

    suspend fun load(api: GatewayApi, id: String): Bitmap? {
        if (cache.containsKey(id)) return cache[id]
        val bmp = runCatching {
            api.productImageBytes(id)?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
        }.getOrNull()
        cache[id] = bmp
        return bmp
    }

    fun invalidate(id: String) { cache.remove(id) }
    fun clear() { cache.clear() }
}
