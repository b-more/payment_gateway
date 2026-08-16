# InstacomPay POS — Z100 SmartPOS merchant app

Native Kotlin app for the ZCS **Z100 SmartPOS** terminal. It drives the device
hardware (printer, scanner; card/EMV scaffolded-but-disabled) and takes payments
through the InstacomPay gateway.

> **Hardware required.** The ZCS SDK only works on a real Z100 — there is no
> emulator. Build the APK anywhere; install and run it on a device. The vendor
> demo (`../demo/`) can validate printer/scanner/SDK-init independently.

## Prerequisites
- Android Studio (Koala+) or the Android SDK command-line tools, **compileSdk 34**
- **JDK 17**
- A Z100 with USB debugging enabled (for `adb install`)

## Build & install
```bash
cd "Z100 SmartPOS/android"
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
The two ZCS AARs are vendored in `app/libs/` and consumed via `flatDir` — no extra
setup. First build downloads Gradle 8.7 + dependencies (needs internet).

## Configure
`app/build.gradle` → `defaultConfig`:
- `GATEWAY_BASE_URL` — defaults to `https://api.instacompayzm.com`
- `CARD_ENABLED` — **false** (see `hardware/emv/README_BLOCKED.md`)

## What it does (v1)
1. **Activation** — enter the one-time code from the merchant portal (Terminals);
   the app calls `POST /v1/devices/activate` and stores the device credential in
   `EncryptedSharedPreferences`.
2. **Sale** — amount (ngwee) + phone + network → `POST /v1/collections` (with a
   persisted `Idempotency-Key`) → poll `GET /v1/transactions/:id` → print receipt.
3. **Scan-to-pay** — the scanner (HID) prefills the sale form; supports a
   `instacompay://collect?msisdn=&amount=&ref=` QR or a plain phone number.
4. **History / reprint / refund** — device-scoped `GET /v1/transactions`; reprint a
   receipt; refund = a new `POST /v1/disbursements` to the payer (not a reversal).

## Architecture
- `hardware/SdkManager` — one `DriverManager`, `sdkInit()` once, and a coroutine
  dispatcher backed by the SDK's single-thread executor. **Every** blocking SDK
  call runs through `SdkManager.onHardware { … }`; never touch the SDK concurrently.
- `hardware/PrinterService`, `hardware/ScannerHelper` — thin hardware wrappers.
- `hardware/emv/` — **disabled** card scaffold; blocked on a card acquirer.
- `api/GatewayApi` — OkHttp + `org.json`; device auth = `X-Api-Key` + `Bearer <secret>`.
- `data/SecureCredentialStore` (Keystore) + `data/LocalTxnStore` (SQLite log).
- `ui/` — Activation, Sale, History, Scan.

## Version matrix (conservative, known-good for compileSdk 34)
AGP 8.5.2 · Kotlin 1.9.24 · Gradle 8.7 · minSdk 23 / target 34 · OkHttp 4.12 ·
coroutines 1.7.3 · security-crypto 1.1.0-alpha06.

## Status
This is a **skeleton**: it compiles against the confirmed SDK surface and wires
every v1 flow end to end, but it has **not been built against the real SDK on a
device** yet. Expect small fixups on first hardware build — most likely exact SDK
method signatures (printer formatting, the device serial getter in `SdkManager`)
and Material theme resource names. Bring the printer up first (Sale → “Test print”)
before wiring the network, then activate against a sandbox code.
