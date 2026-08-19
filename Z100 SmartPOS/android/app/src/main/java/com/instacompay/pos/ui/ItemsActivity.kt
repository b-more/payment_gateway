package com.instacompay.pos.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.R
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.api.Product
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivityItemsBinding
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.io.File

/** Manage the product catalog on the terminal: add (with an optional photo), list, remove. */
class ItemsActivity : AppCompatActivity() {
    private lateinit var b: ActivityItemsBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }

    // State for the currently-open "Add item" dialog.
    private var pendingImage: Bitmap? = null
    private var pendingThumb: ImageView? = null
    private var cameraUri: Uri? = null
    private var barcodeField: EditText? = null

    private val scan = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        if (res.resultCode == Activity.RESULT_OK) {
            val code = res.data?.getStringExtra(ScanActivity.EXTRA_RESULT)?.trim().orEmpty()
            if (code.isNotEmpty()) barcodeField?.setText(code)
        }
    }

    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { setPending(decodeScaled(it)) }
    }
    private val takePhoto = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (ok) cameraUri?.let { setPending(decodeScaled(it)) }
    }

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
                setPadding(dp(16), dp(11), dp(16), dp(11))
            }
            val thumb = ImageView(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(44), dp(44)).apply { marginEnd = dp(12) }
                scaleType = ImageView.ScaleType.CENTER_CROP
                setBackgroundResource(R.drawable.bg_nav_on)
                setImageResource(R.drawable.ic_grid)
            }
            if (p.hasImage) loadThumb(p.id, thumb)
            val nameCol = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            nameCol.addView(TextView(this).apply {
                text = p.name; setTextColor(color(R.color.ink)); textSize = 15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            })
            if (!p.barcode.isNullOrBlank()) nameCol.addView(TextView(this).apply {
                text = "▤ ${p.barcode}"; setTextColor(color(R.color.slate)); textSize = 12f
            })
            val name = nameCol
            val price = TextView(this).apply {
                text = fmtK(p.priceNgwee); setTextColor(color(R.color.brand)); textSize = 15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            }
            val del = TextView(this).apply {
                text = "Remove"; setTextColor(color(R.color.accent)); textSize = 13f
                setPadding(dp(16), 0, 0, 0); isClickable = true; isFocusable = true
                setOnClickListener { confirmDelete(p) }
            }
            row.addView(thumb); row.addView(name); row.addView(price); row.addView(del)
            b.itemList.addView(row)
            val div = View(this).apply {
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
                setBackgroundColor(color(R.color.line))
            }
            b.itemList.addView(div)
        }
    }

    private fun loadThumb(id: String, img: ImageView) {
        lifecycleScope.launch {
            ProductImages.load(api, id)?.let { img.setImageBitmap(it) }
        }
    }

    private fun addDialog() {
        pendingImage = null
        val pad = dp(20)
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, dp(8), pad, 0) }
        val name = EditText(this).apply { hint = "Name (e.g. Coca-Cola 350ml)"; inputType = InputType.TYPE_CLASS_TEXT }
        val price = EditText(this).apply { hint = "Price in Kwacha (e.g. 10 or 10.50)"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val category = EditText(this).apply { hint = "Category (optional)"; inputType = InputType.TYPE_CLASS_TEXT }

        val barcode = EditText(this).apply {
            hint = "Barcode (optional)"; inputType = InputType.TYPE_CLASS_TEXT
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        barcodeField = barcode
        val scanBtn = TextView(this).apply {
            text = "Scan"; setTextColor(color(R.color.brand)); textSize = 15f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(dp(14), dp(10), dp(6), dp(10))
            isClickable = true; isFocusable = true
            setOnClickListener { scan.launch(Intent(this@ItemsActivity, ScanActivity::class.java)) }
        }
        val barcodeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            addView(barcode); addView(scanBtn)
        }

        val photoRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(14), 0, dp(4))
        }
        val thumb = ImageView(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(56), dp(56)).apply { marginEnd = dp(14) }
            scaleType = ImageView.ScaleType.CENTER_CROP
            setBackgroundResource(R.drawable.bg_nav_on)
            setImageResource(R.drawable.ic_grid)
        }
        val photoBtn = TextView(this).apply {
            text = "Add photo"; setTextColor(color(R.color.brand)); textSize = 15f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            isClickable = true; isFocusable = true
            setOnClickListener { photoSourceDialog() }
        }
        pendingThumb = thumb
        photoRow.addView(thumb); photoRow.addView(photoBtn)

        box.addView(name); box.addView(price); box.addView(category); box.addView(barcodeRow); box.addView(photoRow)

        AlertDialog.Builder(this)
            .setTitle("Add item")
            .setView(box)
            .setPositiveButton("Add") { _, _ ->
                val n = name.text.toString().trim()
                val ngwee = kwachaToNgwee(price.text.toString())
                val cat = category.text.toString().trim().ifEmpty { null }
                if (n.isEmpty() || ngwee == null) { toast("Enter a name and a valid price"); return@setPositiveButton }
                val imageB64 = pendingImage?.let { jpegBase64(it) }
                val bc = barcode.text.toString().trim().ifEmpty { null }
                if (bc != null && !bc.matches(Regex("^[A-Za-z0-9._-]{1,64}$"))) { toast("Invalid barcode"); return@setPositiveButton }
                lifecycleScope.launch {
                    try {
                        api.createProduct(n, ngwee, cat, imageB64, if (imageB64 != null) "image/jpeg" else null, bc)
                        pendingImage = null; pendingThumb = null; barcodeField = null
                        load()
                    } catch (e: Exception) { if (!lockIfRevoked(e)) toast("Could not add item") }
                }
            }
            .setNegativeButton("Cancel") { _, _ -> pendingImage = null; pendingThumb = null; barcodeField = null }
            .show()
    }

    private fun photoSourceDialog() {
        AlertDialog.Builder(this)
            .setTitle("Add photo")
            .setItems(arrayOf("Take photo", "Choose from gallery")) { _, which ->
                if (which == 0) launchCamera() else pickImage.launch("image/*")
            }
            .show()
    }

    private fun launchCamera() {
        try {
            val dir = File(cacheDir, "captures").apply { mkdirs() }
            val file = File(dir, "cap_${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
            cameraUri = uri
            takePhoto.launch(uri)
        } catch (e: Exception) {
            toast("Camera unavailable — use the gallery")
        }
    }

    private fun setPending(bmp: Bitmap?) {
        if (bmp == null) { toast("Could not read that image"); return }
        pendingImage = bmp
        pendingThumb?.setImageBitmap(bmp)
    }

    /** Decode a picked/captured image, downscaled to a sane max edge to keep uploads small. */
    private fun decodeScaled(uri: Uri, maxEdge: Int = 640): Bitmap? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / sample > maxEdge * 2 || bounds.outHeight / sample > maxEdge * 2) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
        decoded?.let { scaleToMax(it, maxEdge) }
    } catch (e: Exception) { null }

    private fun scaleToMax(src: Bitmap, maxEdge: Int): Bitmap {
        val w = src.width; val h = src.height
        val longest = maxOf(w, h)
        if (longest <= maxEdge) return src
        val ratio = maxEdge.toFloat() / longest
        return Bitmap.createScaledBitmap(src, (w * ratio).toInt(), (h * ratio).toInt(), true)
    }

    private fun jpegBase64(bmp: Bitmap): String {
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 80, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    private fun confirmDelete(p: Product) {
        AlertDialog.Builder(this)
            .setTitle("Remove ${p.name}?")
            .setPositiveButton("Remove") { _, _ ->
                lifecycleScope.launch {
                    try { api.deleteProduct(p.id); ProductImages.invalidate(p.id); load() }
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
