package com.instacompay.pos.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * One recorded sale attempt on this terminal. `idempotencyKey` is the stable
 * local key (created before the network call), so a retry reuses it and the
 * gateway — unique on account_id + idempotency_key — never double-charges.
 */
data class LocalSale(
    val idempotencyKey: String,
    val serverId: String,        // gateway txn id once known ("" until then)
    val processor: String,       // MTN / AIRTEL
    val networkLabel: String,    // "MTN MoMo" / "Airtel Money"
    val msisdn: String,
    val amountNgwee: String,
    val chargeNgwee: String,
    val totalNgwee: String,
    val status: String,          // PENDING/PROCESSING/SUCCESS/FAILED/EXPIRED/REVERSED/UNKNOWN
    val reference: String,
    val failureReason: String?,
    val createdAt: Long,
    val attendant: String = "",  // who took this sale (blank if staff not in use)
) {
    val isTerminal: Boolean get() = status in TERMINAL
    val isSuccess: Boolean get() = status == "SUCCESS"
    val needsReconcile: Boolean get() = status in NEEDS_RECONCILE

    companion object {
        val TERMINAL = setOf("SUCCESS", "FAILED", "EXPIRED", "REVERSED")
        val NEEDS_RECONCILE = setOf("PENDING", "PROCESSING", "UNKNOWN")
    }
}

data class DaySummary(val count: Int, val totalNgwee: Long)

/** On-device sales log — survives restarts for reprint history and offline retry. */
class LocalTxnStore(context: Context) : SQLiteOpenHelper(context, "collect.db", null, 2) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE sales(
              idempotency_key TEXT PRIMARY KEY,
              server_id TEXT,
              processor TEXT,
              network_label TEXT,
              msisdn TEXT,
              amount_ngwee TEXT,
              charge_ngwee TEXT,
              total_ngwee TEXT,
              status TEXT,
              reference TEXT,
              failure_reason TEXT,
              created_at INTEGER,
              attendant TEXT
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX idx_sales_created ON sales(created_at DESC)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) db.execSQL("ALTER TABLE sales ADD COLUMN attendant TEXT")
    }

    fun upsert(s: LocalSale) {
        val cv = ContentValues().apply {
            put("idempotency_key", s.idempotencyKey)
            put("server_id", s.serverId)
            put("processor", s.processor)
            put("network_label", s.networkLabel)
            put("msisdn", s.msisdn)
            put("amount_ngwee", s.amountNgwee)
            put("charge_ngwee", s.chargeNgwee)
            put("total_ngwee", s.totalNgwee)
            put("status", s.status)
            put("reference", s.reference)
            put("failure_reason", s.failureReason)
            put("created_at", s.createdAt)
            put("attendant", s.attendant)
        }
        writableDatabase.insertWithOnConflict("sales", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun todaySummary(): DaySummary {
        val startOfDay = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0)
            set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0)
        }.timeInMillis
        var count = 0; var total = 0L
        readableDatabase.rawQuery(
            "SELECT total_ngwee FROM sales WHERE status='SUCCESS' AND created_at >= ?",
            arrayOf(startOfDay.toString()),
        ).use { c -> while (c.moveToNext()) { count++; total += c.getString(0)?.toLongOrNull() ?: 0L } }
        return DaySummary(count, total)
    }

    fun recent(limit: Int = 60): List<LocalSale> = query("ORDER BY created_at DESC LIMIT ?", arrayOf(limit.toString()))

    fun needingReconcile(): List<LocalSale> =
        query("WHERE status IN ('PENDING','PROCESSING','UNKNOWN') ORDER BY created_at ASC LIMIT 20", emptyArray())

    /** Successful sales since a given time (for shift cash-up). */
    fun successSince(sinceMs: Long): List<LocalSale> =
        query("WHERE status='SUCCESS' AND created_at >= ? ORDER BY created_at ASC", arrayOf(sinceMs.toString()))

    private fun query(clause: String, args: Array<String>): List<LocalSale> {
        val out = ArrayList<LocalSale>()
        readableDatabase.rawQuery(
            "SELECT idempotency_key,server_id,processor,network_label,msisdn,amount_ngwee,charge_ngwee," +
                "total_ngwee,status,reference,failure_reason,created_at,attendant FROM sales $clause",
            args,
        ).use { c ->
            while (c.moveToNext()) out.add(
                LocalSale(
                    idempotencyKey = c.getString(0),
                    serverId = c.getString(1).orEmpty(),
                    processor = c.getString(2).orEmpty(),
                    networkLabel = c.getString(3).orEmpty(),
                    msisdn = c.getString(4).orEmpty(),
                    amountNgwee = c.getString(5).orEmpty(),
                    chargeNgwee = c.getString(6) ?: "0",
                    totalNgwee = c.getString(7) ?: "0",
                    status = c.getString(8).orEmpty(),
                    reference = c.getString(9).orEmpty(),
                    failureReason = c.getString(10),
                    createdAt = c.getLong(11),
                    attendant = c.getString(12).orEmpty(),
                ),
            )
        }
        return out
    }
}
