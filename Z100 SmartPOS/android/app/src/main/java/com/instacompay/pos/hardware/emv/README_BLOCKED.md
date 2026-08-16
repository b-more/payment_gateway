# Card / EMV — blocked (Phase 2)

This module is **scaffolded but disabled** (`BuildConfig.CARD_ENABLED = false`).

## Why it can't be enabled yet

A chip/contactless card payment on the Z100 runs the ZCS EMV kernel
(`EmvHandler.emvTrans(...)`). Two steps in that flow require a **card acquirer**
that InstacomPay does not have:

1. **`OnEmvListener.onlineProc()`** — the kernel expects an online authorization
   round-trip to an acquiring host (ISO-8583 / field-55). InstacomPay is a
   mobile-money aggregator; there is no card acquiring host to authorize against.
2. **`PinPadManager.inputOnlinePin(...)`** — online PIN needs acquirer PIN keys
   **injected** into the pinpad (a key ceremony). We have none.

On top of that, going live with card requires **EMV L3 certification** with the
acquirer/scheme.

## What the scaffold covers (for the future)

- `CardReadManager` (IC / MAG / RF) + `searchCard(...)`
- `EmvHandler.getInstance()` kernel init
- AID/CAPK tables bundled at `app/src/main/assets/emv/{AidRec.data,CapkRec.data}`

## To unblock

Establish an acquiring relationship, complete the PIN-key injection ceremony,
implement `onlineProc()` against the acquirer host, certify, then set
`CARD_ENABLED = true`. Until then, the three mobile-money flows (collection,
scan-to-pay, refund-as-disbursement) are the shippable product.
