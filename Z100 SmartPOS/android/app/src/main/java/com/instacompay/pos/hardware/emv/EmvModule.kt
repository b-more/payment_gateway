package com.instacompay.pos.hardware.emv

import com.instacompay.pos.config.AppConfig

/**
 * Card / EMV — SCAFFOLD, DISABLED. See README_BLOCKED.md.
 *
 * InstacomPay has no card-acquiring host, so the EMV kernel's onlineProc() has
 * nowhere to authorise and the pinpad has no acquirer keys to encrypt a PIN with.
 * This module therefore never runs a real transaction. It exists so the hardware
 * wiring (card search + kernel init + AID/CAPK load from assets/emv) is in place
 * for the day an acquirer relationship, key injection, and certification exist.
 *
 * Guarded by BuildConfig.CARD_ENABLED (false). Do NOT flip it on without the
 * above — a card payment cannot settle otherwise.
 */
object EmvModule {
    val enabled: Boolean get() = AppConfig.cardEnabled // false

    /** Placeholder — intentionally does nothing until card is unblocked. */
    fun startCardPayment(amountNgwee: String) {
        check(enabled) { "Card/EMV is disabled: no acquiring host. See README_BLOCKED.md" }
        // TODO(card): CardReadManager.searchCard(...) -> EmvHandler kernel init ->
        //   load AID/CAPK from assets/emv -> emvTrans(...) with OnEmvListener.
        //   Blocked on: acquirer host for onlineProc + injected PIN keys + EMV cert.
        throw NotImplementedError("Card/EMV is not available yet")
    }
}
