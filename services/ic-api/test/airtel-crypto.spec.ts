import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { encryptPin } from '../src/airtel/airtel.crypto';
import { pkcs1Decrypt } from './airtel-pkcs1-decrypt';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
});
const pubB64 = (publicKey as Buffer).toString('base64');
const privB64 = (privateKey as Buffer).toString('base64');

function decrypt(ciphertextB64: string): string {
  return pkcs1Decrypt(ciphertextB64, privB64);
}

test('encryptPin round-trips through Airtel-style RSA/PKCS1', () => {
  const enc = encryptPin('1234', pubB64);
  assert.match(enc, /^[A-Za-z0-9+/=]+$/); // base64
  assert.equal(decrypt(enc), '1234');
});

test('PKCS1 padding randomises ciphertext (two encryptions differ, same plaintext)', () => {
  const a = encryptPin('4321', pubB64);
  const b = encryptPin('4321', pubB64);
  assert.notEqual(a, b);
  assert.equal(decrypt(a), '4321');
  assert.equal(decrypt(b), '4321');
});

test('rejects a non-numeric or wrong-length PIN', () => {
  assert.throws(() => encryptPin('abcd', pubB64));
  assert.throws(() => encryptPin('12', pubB64));
  assert.throws(() => encryptPin('', pubB64));
});

test('rejects a missing public key', () => {
  assert.throws(() => encryptPin('1234', ''));
});
