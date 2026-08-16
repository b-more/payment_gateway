package com.instacompay.pos.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class LocalTxn(
    val id: String,
    val idempotencyKey: String,
    val processor: String,
    val msisdn: String,
    val amountNgwee: String,
    val status: String,
    val reference: String?,
    val createdAt: Long,
)

/**
 * On-device transaction log — survives restarts for reprint and offline history.
 * The persisted idempotency key lets a network retry reuse the same key so the
 * gateway (unique on account_id + idempotency_key) never double-charges.
 */
class LocalTxnStore(context: Context) : SQLiteOpenHelper(context, "pos.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE txns(
              id TEXT PRIMARY KEY,
              idempotency_key TEXT,
              processor TEXT,
              msisdn TEXT,
              amount_ngwee TEXT,
              status TEXT,
              reference TEXT,
              created_at INTEGER
            )
            """.trimIndent(),
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) { /* v1 */ }

    fun upsert(t: LocalTxn) {
        val cv = ContentValues().apply {
            put("id", t.id)
            put("idempotency_key", t.idempotencyKey)
            put("processor", t.processor)
            put("msisdn", t.msisdn)
            put("amount_ngwee", t.amountNgwee)
            put("status", t.status)
            put("reference", t.reference)
            put("created_at", t.createdAt)
        }
        writableDatabase.insertWithOnConflict("txns", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun updateStatus(id: String, status: String) {
        writableDatabase.execSQL("UPDATE txns SET status=? WHERE id=?", arrayOf(status, id))
    }

    fun recent(limit: Int = 50): List<LocalTxn> {
        val out = ArrayList<LocalTxn>()
        readableDatabase.rawQuery(
            "SELECT id,idempotency_key,processor,msisdn,amount_ngwee,status,reference,created_at " +
                "FROM txns ORDER BY created_at DESC LIMIT ?",
            arrayOf(limit.toString()),
        ).use { c ->
            while (c.moveToNext()) {
                out.add(
                    LocalTxn(
                        id = c.getString(0),
                        idempotencyKey = c.getString(1),
                        processor = c.getString(2),
                        msisdn = c.getString(3),
                        amountNgwee = c.getString(4),
                        status = c.getString(5),
                        reference = c.getString(6),
                        createdAt = c.getLong(7),
                    ),
                )
            }
        }
        return out
    }
}
