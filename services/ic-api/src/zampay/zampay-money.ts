// Money conversion at the ZamPay boundary.
//
// We store money as integer ngwee (bigint); ZamPay speaks decimal ZMW as JSON
// numbers (e.g. 9.8 for K9.80, 5.5, 4.3). The conversion is exactly ÷100 / ×100,
// but it must NOT go through Number arithmetic on the ngwee value — 12_345_678
// ngwee via Number(n)/100 can drift. Format from the integer digits instead.

/**
 * Integer ngwee -> a JSON number in ZMW with at most 2 decimals, exact.
 * 980n -> 9.8, 100000n -> 1000, 430n -> 4.3, 5n -> 0.05.
 */
export function ngweeToZmwNumber(ngwee: bigint): number {
  if (ngwee < 0n) throw new RangeError('ngwee must be >= 0');
  const whole = ngwee / 100n;
  const frac = ngwee % 100n;
  // Build the decimal string from integer parts, then parse once. No float math
  // on the ngwee value, so no drift; JSON.stringify emits it without a trailing
  // ".0" (9.8, 1000, 0.05).
  const text = `${whole.toString()}.${frac.toString().padStart(2, '0')}`;
  return Number(text);
}

/**
 * A ZamPay decimal-ZMW amount -> integer ngwee, rounded to the nearest ngwee.
 * 9.8 -> 980n, 5.5 -> 550n, 4.3 -> 430n. Parses via string to avoid float drift
 * on values like 4.3 (which is 4.2999… in binary).
 */
export function zmwNumberToNgwee(zmw: number): bigint {
  if (!Number.isFinite(zmw) || zmw < 0) throw new RangeError('zmw must be a finite amount >= 0');
  // toFixed(2) rounds half-away-from-zero at the 2nd decimal, then strip the dot.
  const [whole, frac = '00'] = zmw.toFixed(2).split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}
