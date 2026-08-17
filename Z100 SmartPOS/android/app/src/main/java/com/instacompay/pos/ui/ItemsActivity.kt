package com.instacompay.pos.ui

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
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.api.Product
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivityItemsBinding
import kotlinx.coroutines.launch

/** Manage the product catalog on the terminal: add, list, remove. */
class ItemsActivity : AppCompatActivity() {
    private lateinit var b: ActivityItemsBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityItemsBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.backBtn.setOnClickListener { finish() }
        b.addBtn.setOnClickListener { addDialog() }
        load()
    }

    private fun load() {
        lifecycleScope.launch {
            try {
                render(api.listProducts())
            } catch (e: Exception) {
                if (lockIfRevoked(e)) return@launch
                toast("Could not load items")
            }
        }
    }

    private fun render(items: List<Product>) {
        b.itemList.removeAllViews()
        b.itemsEmpty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
        for (p in items) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(16), dp(13), dp(16), dp(13))
            }
            val name = TextView(this).apply {
                text = p.name; setTextColor(color(com.instacompay.pos.R.color.ink)); textSize = 15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            val price = TextView(this).apply {
                text = fmtK(p.priceNgwee); setTextColor(color(com.instacompay.pos.R.color.brand)); textSize = 15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            }
            val del = TextView(this).apply {
                text = "Remove"; setTextColor(color(com.instacompay.pos.R.color.accent)); textSize = 13f
                setPadding(dp(16), 0, 0, 0); isClickable = true; isFocusable = true
                setOnClickListener { confirmDelete(p) }
            }
            row.addView(name); row.addView(price); row.addView(del)
            b.itemList.addView(row)
            val div = View(this).apply {
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
                setBackgroundColor(color(com.instacompay.pos.R.color.line))
            }
            b.itemList.addView(div)
        }
    }

    private fun addDialog() {
        val pad = dp(20)
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, dp(8), pad, 0) }
        val name = EditText(this).apply { hint = "Name (e.g. Coca-Cola 350ml)"; inputType = InputType.TYPE_CLASS_TEXT }
        val price = EditText(this).apply { hint = "Price in Kwacha (e.g. 10 or 10.50)"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val category = EditText(this).apply { hint = "Category (optional)"; inputType = InputType.TYPE_CLASS_TEXT }
        box.addView(name); box.addView(price); box.addView(category)

        AlertDialog.Builder(this)
            .setTitle("Add item")
            .setView(box)
            .setPositiveButton("Add") { _, _ ->
                val n = name.text.toString().trim()
                val ngwee = kwachaToNgwee(price.text.toString())
                val cat = category.text.toString().trim().ifEmpty { null }
                if (n.isEmpty() || ngwee == null) { toast("Enter a name and a valid price"); return@setPositiveButton }
                lifecycleScope.launch {
                    try { api.createProduct(n, ngwee, cat); load() }
                    catch (e: Exception) { if (!lockIfRevoked(e)) toast("Could not add item") }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun confirmDelete(p: Product) {
        AlertDialog.Builder(this)
            .setTitle("Remove ${p.name}?")
            .setPositiveButton("Remove") { _, _ ->
                lifecycleScope.launch {
                    try { api.deleteProduct(p.id); load() }
                    catch (e: Exception) { if (!lockIfRevoked(e)) toast("Could not remove") }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun kwachaToNgwee(input: String): String? {
        val s = input.trim()
        if (!s.matches(Regex("^\\d+(\\.\\d{1,2})?$"))) return null
        val parts = s.split(".")
        val whole = parts[0].toLongOrNull() ?: return null
        val frac = if (parts.size > 1) parts[1].padEnd(2, '0').toLong() else 0L
        val ngwee = whole * 100 + frac
        return if (ngwee < 0) null else ngwee.toString()
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
    private fun color(res: Int) = ContextCompat.getColor(this, res)
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun fmtK(ngwee: String) = "K%,.2f".format((ngwee.toLongOrNull() ?: 0L) / 100.0)
}
