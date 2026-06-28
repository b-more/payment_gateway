// Integer-money helpers. Every monetary value is integer ngwee carried as
// `bigint` (NN-1). JS `number` is never used for money arithmetic. The
// money-safety lint rule (money/no-float-money) guards this at build time.

/**
 * Validate and coerce an inbound monetary value to ngwee `bigint` at the API
 * boundary (NN-1, §3). Rejects non-integers and negatives.
 */
export function toNgwee(input: string | number | bigint, field = 'amount'): bigint {
  if (typeof input === 'bigint') {
    if (input < 0n) throw new RangeError(`${field} must be >= 0`);
    return input;
  }
  if (typeof input === 'number') {
    if (!Number.isInteger(input)) {
      throw new RangeError(`${field} must be an integer number of ngwee, got ${input}`);
    }
    if (input < 0) throw new RangeError(`${field} must be >= 0`);
    return BigInt(input);
  }
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new RangeError(`${field} must be a non-negative integer string of ngwee, got "${input}"`);
  }
  return BigInt(trimmed);
}

/**
 * Integer division of a non-negative numerator by a positive denominator,
 * rounding half-up to the nearest whole unit. Used for percentage charges
 * (CHG-2) so money never touches a float.
 */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('denominator must be > 0');
  if (numerator < 0n) throw new RangeError('negative numerator not supported');
  return (numerator + denominator / 2n) / denominator;
}

/**
 * Parse a `numeric(5,2)` percent value (PostgreSQL returns it as a string) into
 * an integer scaled by 100 — hundredths of a percent. e.g. "2.50" -> 250n.
 * Integer-safe; no float ever materialises.
 */
export function parsePercentToScaled(numericText: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(numericText.trim());
  if (!match) throw new RangeError(`invalid percent value: "${numericText}"`);
  const whole = match[1];
  const frac = (match[2] ?? '').padEnd(2, '0');
  return BigInt(whole) * 100n + BigInt(frac);
}
