import { roundHalfUp } from './money';
import type { ChargeType, ChargeFulfiller } from './types';

// Charge calculation (§5.4). All integer ngwee (NN-1). Percentage is expressed
// as hundredths of a percent (percent * 100) so the math stays in bigint.

export interface ChargeConfig {
  chargeType: ChargeType;
  fixedValue: bigint; // ngwee, for FIXED / TIERED
  percentScaled: bigint; // percent * 100 (hundredths of a percent), for PERCENTAGE / TIERED
}

// percent fraction = percentScaled / 100 / 100  =>  charge = amount * percentScaled / 10000
const PERCENT_DENOMINATOR = 10000n;

/** Compute the charge for an amount under a config (CHG-1..3). */
export function computeCharge(config: ChargeConfig, amount: bigint): bigint {
  if (amount < 0n) throw new RangeError('amount must be >= 0');
  switch (config.chargeType) {
    case 'FIXED':
      return config.fixedValue; // CHG-1
    case 'PERCENTAGE':
      return roundHalfUp(amount * config.percentScaled, PERCENT_DENOMINATOR); // CHG-2 (round half-up)
    case 'TIERED':
      return config.fixedValue + roundHalfUp(amount * config.percentScaled, PERCENT_DENOMINATOR); // CHG-3
    default: {
      const exhaustive: never = config.chargeType;
      throw new RangeError(`unknown charge type: ${String(exhaustive)}`);
    }
  }
}

export interface TransactionAmounts {
  amount: bigint; // the transaction principal
  charge: bigint; // computed fee
  netAmount: bigint; // what the merchant nets (CHG-6, for reporting)
  required: bigint; // debited from float = amount + charge (TXN-2)
}

/**
 * Resolve the principal/charge/net/required quartet for a transaction
 * (CHG-4/5/6, TXN-2). SOURCE: customer bears the charge, merchant nets the full
 * amount. MERCHANT: merchant bears the charge, netting amount - charge.
 */
export function computeAmounts(
  config: ChargeConfig,
  fulfiller: ChargeFulfiller,
  amount: bigint,
): TransactionAmounts {
  const charge = computeCharge(config, amount);
  const netAmount = fulfiller === 'SOURCE' ? amount : amount - charge; // CHG-4 / CHG-5
  if (netAmount < 0n) {
    throw new RangeError('charge exceeds amount for MERCHANT fulfiller');
  }
  return { amount, charge, netAmount, required: amount + charge }; // TXN-2
}
