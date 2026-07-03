// Money boundary between our engine (integer ngwee, bigint — NN-1/SEC-M1) and
// Airtel's wire format (kwacha as a JSON number, 2 dp confirmed: amount 1 = K1.00,
// K1.50 = 1.5). All arithmetic here is integer/string based — no floating point
// is ever applied to a money value; a JS number is produced only at the very
// last step for JSON serialisation.

/** ngwee (bigint) -> Airtel wire amount in kwacha (JS number, ≤2 dp). */
export function ngweeToKwacha(ngwee: bigint): number {
  if (ngwee < 0n) throw new Error('amount must be non-negative');
  const whole = ngwee / 100n;
  const fraction = ngwee % 100n;
  // Build the decimal string from integer parts, then parse once for the wire.
  return Number(`${whole.toString()}.${fraction.toString().padStart(2, '0')}`);
}

/** Airtel wire amount in kwacha (number or string) -> ngwee (bigint), exact to 2 dp. */
export function kwachaToNgwee(kwacha: number | string): bigint {
  const raw = (typeof kwacha === 'number' ? kwacha.toString() : kwacha).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`invalid kwacha amount: ${raw}`);
  }
  const negative = raw.startsWith('-');
  const [wholePart, fracPart = ''] = raw.replace('-', '').split('.');
  // Take the first two fraction digits (ngwee precision); round on the third.
  const frac2 = (fracPart + '00').slice(0, 2);
  let ngwee = BigInt(wholePart) * 100n + BigInt(frac2);
  if (fracPart.length > 2 && Number(fracPart[2]) >= 5) ngwee += 1n; // round half-up
  return negative ? -ngwee : ngwee;
}
