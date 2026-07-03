// Disbursement PIN encryption (§4). Airtel requires the wallet PIN encrypted
// with RSA/ECB/PKCS1Padding using their 1024-bit public key (supplied as base64
// DER/SPKI in config), then base64-encoded.
//
// The PIN comes from env/secret config — never hardcoded, never logged (plain
// or encrypted). Error messages here never include the PIN value.

import { constants, createPublicKey, publicEncrypt } from 'node:crypto';

/** Encrypt a numeric wallet PIN with Airtel's RSA public key; returns base64. */
export function encryptPin(pin: string, publicKeyBase64: string): string {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('Airtel PIN must be 4–8 digits'); // value intentionally omitted
  }
  if (!publicKeyBase64) {
    throw new Error('Airtel public key (AIRTEL_*_PUBLIC_KEY) is not configured');
  }
  const key = createPublicKey({
    key: Buffer.from(publicKeyBase64, 'base64'),
    format: 'der',
    type: 'spki',
  });
  const ciphertext = publicEncrypt(
    { key, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(pin, 'utf8'),
  );
  return ciphertext.toString('base64');
}
