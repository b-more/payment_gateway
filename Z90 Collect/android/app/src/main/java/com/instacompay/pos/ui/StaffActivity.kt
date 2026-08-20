package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.instacompay.pos.R
import com.instacompay.pos.data.Staff
import com.instacompay.pos.data.StaffStore
import com.instacompay.pos.databinding.ActivityStaffBinding

/** Manager area: create/remove attendants (name + PIN) and open the shift cash-up. */
class StaffActivity : AppCompatActivity() {
    private lateinit var b: ActivityStaffBinding
    private val staff by lazy { StaffStore(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityStaffBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.backBtn.setOnClickListener { finish() }
        b.addBtn.setOnClickListener { addStaffDialog() }
        b.cashUpBtn.setOnClickListener { startActivity(Intent(this, CashUpActivity::class.java)) }
        if (!staff.hasManagerPin) setManagerPinDialog()
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    private fun render() {
        val roster = staff.listStaff()
        b.staffList.removeAllViews()
        b.staffEmpty.visibility = if (roster.isEmpty()) View.VISIBLE else View.GONE
        for (s in roster) b.staffList.addView(rowFor(s))
    }

    private fun rowFor(s: Staff): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(14), dp(14), dp(14))
        }
        row.addView(TextView(this).apply {
            text = s.name; setTextColor(color(R.color.ink)); textSize = 15f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        row.addView(TextView(this).apply {
            text = "Remove"; setTextColor(color(R.color.accent)); textSize = 13f
            isClickable = true; isFocusable = true
            setOnClickListener {
                AlertDialog.Builder(this@StaffActivity)
                    .setTitle("Remove ${s.name}?")
                    .setPositiveButton("Remove") { _, _ -> staff.removeStaff(s.id); render() }
                    .setNegativeButton("Cancel", null).show()
            }
        })
        val wrap = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        wrap.addView(row)
        wrap.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
            setBackgroundColor(color(R.color.line))
        })
        return wrap
    }

    private fun addStaffDialog() {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(8), dp(20), 0) }
        val name = EditText(this).apply { hint = "Attendant name"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS }
        val pin = EditText(this).apply { hint = "4-digit PIN"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD }
        box.addView(name); box.addView(pin)
        AlertDialog.Builder(this)
            .setTitle("Add attendant")
            .setView(box)
            .setPositiveButton("Add") { _, _ ->
                val n = name.text.toString().trim(); val p = pin.text.toString().trim()
                if (n.isEmpty() || p.length < 4) { toast("Enter a name and a 4-digit PIN") }
                else { staff.addStaff(n, p); render() }
            }
            .setNegativeButton("Cancel", null).show()
    }

    private fun setManagerPinDialog() {
        val pin = EditText(this).apply { hint = "Set a manager PIN (4+ digits)"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD }
        AlertDialog.Builder(this)
            .setTitle("Protect Staff & cash-up")
            .setMessage("Set a manager PIN. It's required to open this screen and to close a shift.")
            .setView(pin)
            .setCancelable(false)
            .setPositiveButton("Save") { _, _ ->
                val p = pin.text.toString().trim()
                if (p.length >= 4) staff.setManagerPin(p) else { toast("PIN must be 4+ digits"); setManagerPinDialog() }
            }
            .show()
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
    private fun color(res: Int) = ContextCompat.getColor(this, res)
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
