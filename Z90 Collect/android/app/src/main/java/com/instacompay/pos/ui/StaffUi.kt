package com.instacompay.pos.ui

import android.content.Intent
import android.text.InputType
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.instacompay.pos.data.StaffStore

/** Shared staff sign-in / manager-gate dialogs (used by Dashboard and Collect). */

fun AppCompatActivity.pinField(): EditText = EditText(this).apply {
    inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
    hint = "PIN"
}

/** Choose an attendant and verify their PIN; calls [onSignedIn] on success. */
fun AppCompatActivity.promptSignIn(staff: StaffStore, onSignedIn: () -> Unit) {
    val roster = staff.listStaff()
    if (roster.isEmpty()) { startActivity(Intent(this, StaffActivity::class.java)); return }
    AlertDialog.Builder(this)
        .setTitle("Who's on the till?")
        .setItems(roster.map { it.name }.toTypedArray()) { _, i ->
            val s = roster[i]
            val input = pinField()
            AlertDialog.Builder(this)
                .setTitle("${s.name} — enter PIN")
                .setView(input)
                .setPositiveButton("Sign in") { _, _ ->
                    if (staff.verifyStaff(s.id, input.text.toString())) { staff.signIn(s); onSignedIn() }
                    else Toast.makeText(this, "Wrong PIN", Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
        .show()
}

/** Open Staff & cash-up, gated by the manager PIN (prompts to set one first-run). */
fun AppCompatActivity.openStaffGated(staff: StaffStore) {
    if (!staff.hasManagerPin) { startActivity(Intent(this, StaffActivity::class.java)); return }
    val input = pinField()
    AlertDialog.Builder(this)
        .setTitle("Manager PIN")
        .setView(input)
        .setPositiveButton("OK") { _, _ ->
            if (staff.verifyManager(input.text.toString())) startActivity(Intent(this, StaffActivity::class.java))
            else Toast.makeText(this, "Wrong PIN", Toast.LENGTH_SHORT).show()
        }
        .setNegativeButton("Cancel", null)
        .show()
}
