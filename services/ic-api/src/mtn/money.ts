// Money boundary for MTN: our engine is integer ngwee (bigint), MTN's `amount`
// is a decimal STRING (2 dp for ZMW, e.g. "1.50"). Integer/string math only — no
// floating point is ever applied to a money value.

/** ngwee (bigint) -> MTN wire amount, a 2-dp decimal string (e.g. "1.50"). */
export function ngweeToAmount(ngwee: bigint): string {
  if (ngwee < 0n) throw new Error('amount must be non-negative');
  const whole = ngwee / 100n;
  const fraction = ngwee % 100n;
  return `${whole.toString()}.${fraction.toString().padStart(2, '0')}`;
}

/** MTN wire amount (decimal string/number) -> ngwee (bigint), exact to 2 dp. */
export function amountToNgwee(amount: number | string): bigint {
  const raw = (typeof amount === 'number' ? amount.toString() : amount).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`invalid MTN amount: ${raw}`);
  }
  const negative = raw.startsWith('-');
  const [wholePart, fracPart = ''] = raw.replace('-', '').split('.');
  const frac2 = (fracPart + '00').slice(0, 2);
  let ngwee = BigInt(wholePart) * 100n + BigInt(frac2);
  if (fracPart.length > 2 && Number(fracPart[2]) >= 5) ngwee += 1n; // round half-up
  return negative ? -ngwee : ngwee;
}
