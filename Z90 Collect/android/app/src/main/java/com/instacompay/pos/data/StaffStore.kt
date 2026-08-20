package com.instacompay.pos.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class Staff(val id: String, val name: String)

/**
 * Terminal staff roster + shift state, encrypted at rest. Attendants sign in with
 * a PIN; every sale is stamped to the current attendant. A manager PIN gates
 * cash-up and staff management so a waiter can't peek at the till or close a shift.
 */
class StaffStore(context: Context) {
    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context, "collect_staff", masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    // ── Manager PIN ──
    val hasManagerPin: Boolean get() = !prefs.getString("mgrPin", null).isNullOrBlank()
    fun setManagerPin(pin: String) = prefs.edit().putString("mgrPin", pin).apply()
    fun verifyManager(pin: String): Boolean = prefs.getString("mgrPin", null) == pin

    // ── Roster ──
    fun listStaff(): List<Staff> {
        val arr = JSONArray(prefs.getString("staff", "[]"))
        return (0 until arr.length()).map { val o = arr.getJSONObject(it); Staff(o.getString("id"), o.getString("name")) }
    }

    fun addStaff(name: String, pin: String): Staff {
        val arr = JSONArray(prefs.getString("staff", "[]"))
        val s = JSONObject().put("id", UUID.randomUUID().toString()).put("name", name).put("pin", pin)
        arr.put(s)
        prefs.edit().putString("staff", arr.toString()).apply()
        return Staff(s.getString("id"), name)
    }

    fun removeStaff(id: String) {
        val arr = JSONArray(prefs.getString("staff", "[]"))
        val kept = JSONArray()
        for (i in 0 until arr.length()) { val o = arr.getJSONObject(i); if (o.getString("id") != id) kept.put(o) }
        prefs.edit().putString("staff", kept.toString()).apply()
        if (currentAttendantId == id) signOut()
    }

    fun verifyStaff(id: String, pin: String): Boolean {
        val arr = JSONArray(prefs.getString("staff", "[]"))
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            if (o.getString("id") == id) return o.getString("pin") == pin
        }
        return false
    }

    // ── Current attendant + shift ──
    val currentAttendantId: String? get() = prefs.getString("curId", null)
    val currentAttendantName: String? get() = prefs.getString("curName", null)
    val isSignedIn: Boolean get() = !currentAttendantId.isNullOrBlank()

    fun signIn(s: Staff) {
        val e = prefs.edit().putString("curId", s.id).putString("curName", s.name)
        if (prefs.getLong("shiftStart", 0L) == 0L) e.putLong("shiftStart", System.currentTimeMillis())
        e.apply()
    }

    fun signOut() = prefs.edit().remove("curId").remove("curName").apply()

    /** Sales on/after this time belong to the current shift. */
    fun shiftStartMs(): Long {
        val v = prefs.getLong("shiftStart", 0L)
        return if (v == 0L) System.currentTimeMillis() else v
    }

    /** Close the shift: sign out and start a fresh shift window from now. */
    fun closeShift() = prefs.edit().remove("curId").remove("curName")
        .putLong("shiftStart", System.currentTimeMillis()).apply()
}
