import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ngweeToZmwNumber, zmwNumberToNgwee } from '../src/zampay/zampay-money';
import { ZampaySettlementService } from '../src/zampay/zampay-settlement.service';

test('ngwee -> ZMW number: exact, no float drift', () => {
  assert.equal(ngweeToZmwNumber(980n), 9.8);
  assert.equal(ngweeToZmwNumber(550n), 5.5);
  assert.equal(ngweeToZmwNumber(430n), 4.3);
  assert.equal(ngweeToZmwNumber(100000n), 1000);
  assert.equal(ngweeToZmwNumber(5n), 0.05);
  assert.equal(ngweeToZmwNumber(0n), 0);
  assert.equal(ngweeToZmwNumber(1n), 0.01);
  assert.equal(ngweeToZmwNumber(12_345_678n), 123456.78);
});

test('ZMW number -> ngwee: parses via string, no binary drift', () => {
  assert.equal(zmwNumberToNgwee(9.8), 980n);
  assert.equal(zmwNumberToNgwee(5.5), 550n);
  assert.equal(zmwNumberToNgwee(4.3), 430n); // 4.3 is 4.2999… in binary — must still give 430
  assert.equal(zmwNumberToNgwee(1000), 100000n);
  assert.equal(zmwNumberToNgwee(0.05), 5n);
  assert.equal(zmwNumberToNgwee(0), 0n);
});

test('round-trip ngwee -> ZMW -> ngwee is identity', () => {
  for (const n of [0n, 1n, 5n, 99n, 100n, 430n, 550n, 980n, 100000n, 123457n, 9_999_999n]) {
    assert.equal(zmwNumberToNgwee(ngweeToZmwNumber(n)), n, `round-trip ${n}`);
  }
});

test('negative ngwee is rejected', () => {
  assert.throws(() => ngweeToZmwNumber(-1n), />= 0/);
});

test('settlement payload: amount is decimal ZMW, Σ services, correct destination', () => {
  const svc = new ZampaySettlementService({} as never, () => ({
    enabled: true,
    currency: 'ZMW',
    httpTimeoutMs: 15000,
    identityName: 'instacompaymobile',
    accountNumber: 'COL-0001010',
  }));
  const payload = svc.buildPayload({
    paymentReferenceNumber: 'WIRE-123',
    amountNgwee: 980n, // K9.80 = 5.5 + 4.3
    currency: 'ZMW',
    destination: {
      bankAccountNumber: '0132030000194',
      bicCode: 'INZAZMLX',
      sortCode: '090013',
      accountName: 'Lusaka City Council - Revenue',
      bankName: 'Indo-Zambia Bank Limited',
    },
    serviceIds: ['0aec6bbc-b505-41d0-8a58-3addcc53f190', '10934ec1-1ff4-4a0a-a9d4-31bec6e6abd3'],
    createdAt: '2026-07-31',
  });
  assert.equal(payload.amount, 9.8);
  assert.equal(payload.bicCode, 'INZAZMLX');
  assert.equal(payload.bankAccountNumber, '0132030000194');
  assert.equal(payload.serviceIds.length, 2);
  assert.equal(payload.createdAt, '2026-07-31');
  assert.equal(JSON.stringify(payload).includes('"amount":9.8'), true, 'serialises as 9.8, not "9.80"');
});
