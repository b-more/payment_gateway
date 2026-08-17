package com.instacompay.pos.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.api.Product
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivitySellBinding
import kotlinx.coroutines.launch

/** Catalog + cart. Tap products into the cart, then charge the total. */
class SellActivity : AppCompatActivity() {
    private lateinit var b: ActivitySellBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }

    private var products: List<Product> = emptyList()
    private val cart = LinkedHashMap<String, Int>()   // productId -> qty

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivitySellBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.navHome.setOnClickListener { finish() }
        b.navHistory.setOnClickListener { startActivity(Intent(this, HistoryActivity::class.java)) }
        b.navItems.setOnClickListener { startActivity(Intent(this, ItemsActivity::class.java)) }
        b.navDisburse.setOnClickListener { toast("Coming soon") }
        b.customAmountBtn.setOnClickListener { startActivity(Intent(this, SaleActivity::class.java)) }
        b.clearBtn.setOnClickListener { cart.clear(); renderCart() }
        b.chargeBtn.setOnClickListener { charge() }
    }

    override fun onResume() {
        super.onResume()
        loadProducts()
    }

    private fun loadProducts() {
        lifecycleScope.launch {
            try {
                products = api.listProducts()
                renderGrid()
            } catch (e: Exception) {
                if (lockIfRevoked(e)) return@launch
            }
        }
    }

    private fun renderGrid() {
        b.productGrid.removeAllViews()
        b.productsEmpty.visibility = if (products.isEmpty()) View.VISIBLE else View.GONE
        val cols = 3
        var row: LinearLayout? = null
        products.forEachIndexed { i, p ->
            if (i % cols == 0) {
                row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                b.productGrid.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            }
            val tile = layoutInflater.inflate(R.layout.item_product, row, false)
            val lp = LinearLayout.LayoutParams(0, dp(88), 1f)
            lp.setMargins(dp(5), dp(5), dp(5), dp(5))
            tile.layoutParams = lp
            tile.findViewById<TextView>(R.id.pName).text = p.name
            tile.findViewById<TextView>(R.id.pPrice).text = fmtK(p.priceNgwee)
            tile.setOnClickListener { cart[p.id] = (cart[p.id] ?: 0) + 1; renderCart() }
            row!!.addView(tile)
        }
        // pad the last row so tiles keep their width
        row?.let { r -> val rem = products.size % cols; if (rem != 0) repeat(cols - rem) {
            val spacer = View(this); spacer.layoutParams = LinearLayout.LayoutParams(0, dp(88), 1f).apply { setMargins(dp(5), dp(5), dp(5), dp(5)) }
            r.addView(spacer)
        } }
    }

    private fun renderCart() {
        b.cartList.removeAllViews()
        b.cartEmpty.visibility = if (cart.isEmpty()) View.VISIBLE else View.GONE
        var total = 0L
        for ((id, qty) in cart) {
            val p = products.firstOrNull { it.id == id } ?: continue
            val line = p.priceNgwee.toLongOrNull()?.times(qty) ?: 0L
            total += line
            val rowV = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(dp(8), dp(9), dp(8), dp(9))
            }
            val q = TextView(this).apply {
                text = qty.toString(); setTextColor(color(R.color.brand)); textSize = 13f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                width = dp(26); gravity = android.view.Gravity.CENTER
                setBackgroundResource(R.drawable.bg_nav_on)
            }
            val name = TextView(this).apply {
                text = p.name; setTextColor(color(R.color.ink)); textSize = 14f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(10) }
            }
            val price = TextView(this).apply {
                text = fmtK(line.toString()); setTextColor(color(R.color.ink)); textSize = 14f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            }
            rowV.addView(q); rowV.addView(name); rowV.addView(price)
            rowV.setOnClickListener {
                val cur = cart[id] ?: 0
                if (cur <= 1) cart.remove(id) else cart[id] = cur - 1
                renderCart()
            }
            b.cartList.addView(rowV)
        }
        b.cartTotal.text = fmtK(total.toString())
        b.chargeBtn.isEnabled = total > 0
        b.chargeBtn.text = if (total > 0) "Charge ${fmtK(total.toString())}" else "Charge"
    }

    private fun charge() {
        var total = 0L
        for ((id, qty) in cart) total += (products.firstOrNull { it.id == id }?.priceNgwee?.toLongOrNull() ?: 0L) * qty
        if (total <= 0) return
        startActivity(Intent(this, SaleActivity::class.java).putExtra(SaleActivity.EXTRA_AMOUNT_NGWEE, total))
        cart.clear(); renderCart()
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
    private fun color(res: Int) = androidx.core.content.ContextCompat.getColor(this, res)
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun fmtK(ngwee: String) = "K%,.2f".format((ngwee.toLongOrNull() ?: 0L) / 100.0)
}
