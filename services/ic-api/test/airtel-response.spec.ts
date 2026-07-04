import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReference, moneyId } from '../src/airtel/airtel-response';

test('sanitizeReference: alphanumeric only, 4-64 chars (Airtel constraint)', () => {
  assert.equal(sanitizeReference('INV-000123'), 'INV000123'); // strips separators
  assert.equal(sanitizeReference('SMOKE-COLLECT-2026'), 'SMOKECOLLECT2026');
  assert.equal(sanitizeReference('ab'), 'abREF'.slice(0, 5)); // padded to >=4
  assert.equal(sanitizeReference('').length >= 4, true); // empty -> padded, never null
  assert.equal(sanitizeReference('x'.repeat(100)).length, 24); // capped to Airtel's real limit
  // A 32-hex UUID (the portal's fallback ref) is capped to an accepted length.
  assert.equal(sanitizeReference('3ccf8df96ffe4a0bb4f410d61dec2e4d').length, 24);
});

test('moneyId: Airtel "NA" placeholder is treated as no id yet', () => {
  assert.equal(moneyId({ data: { transaction: { airtel_money_id: 'NA' } } }), null);
  assert.equal(moneyId({ data: { transaction: {} } }), null);
  assert.equal(moneyId({ data: { transaction: { airtel_money_id: 'MP260703.0712.I36574' } } }), 'MP260703.0712.I36574');
});
