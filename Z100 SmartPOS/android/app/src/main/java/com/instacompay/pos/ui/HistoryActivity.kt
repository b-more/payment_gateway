package com.instacompay.pos.ui

import android.os.Bundle
import android.widget.ArrayAdapter
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.instacompay.pos.api.GatewayApi
import com.instacompay.pos.api.Txn
import com.instacompay.pos.data.SecureCredentialStore
import com.instacompay.pos.databinding.ActivityHistoryBinding
import kotlinx.coroutines.launch

/** Device-scoped history; tap a row for reprint / refund (see TxnActions). */
class HistoryActivity : AppCompatActivity() {
    private lateinit var b: ActivityHistoryBinding
    private val store by lazy { SecureCredentialStore(this) }
    private val api by lazy { GatewayApi(store) }
    private var txns: List<Txn> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityHistoryBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.list.setOnItemClickListener { _, _, pos, _ -> TxnActions.show(this, txns[pos]) { load() } }
        load()
    }

    private fun load() {
        b.status.text = "Loading…"
        lifecycleScope.launch {
            try {
                txns = api.listTransactions(50).items
                b.list.adapter = ArrayAdapter(
                    this@HistoryActivity,
                    android.R.layout.simple_list_item_1,
                    txns.map { rowText(it) },
                )
                b.status.text = if (txns.isEmpty()) "No transactions yet" else ""
            } catch (e: Exception) {
                b.status.text = "Error: ${e.message}"
            }
        }
    }

    private fun rowText(t: Txn) = "${fmtK(t.amount)}  •  ${t.processor}  •  ${t.status}  •  ${t.msisdn ?: "-"}"
    private fun fmtK(ngwee: String): String {
        val n = ngwee.toLongOrNull() ?: 0L
        return "K%,.2f".format(n / 100.0)
    }
}
