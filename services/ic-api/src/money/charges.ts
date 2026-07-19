import { roundHalfUp } from './money';
import type { ChargeType, ChargeFulfiller, TransactionType } from './types';

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
  totalAmount: bigint; // what the PAYER is debited: the figure to show a customer
  required: bigint; // float needed for a DISBURSEMENT = amount + charge (TXN-2)
}

/**
 * Resolve the money quartet for a transaction (CHG-4/5/6, TXN-2).
 *
 * The fee-bearer only has meaning for a COLLECTION:
 *   SOURCE   the customer is debited amount + charge; the merchant nets the
 *            full amount, and Instacom keeps the charge out of the difference.
 *   MERCHANT the customer is debited amount; the merchant nets amount - charge.
 *
 * For a DISBURSEMENT the merchant always bears the fee: float is debited
 * amount + charge and the payee receives amount. You cannot levy a fee on a
 * payee who never agreed to one, so `fulfiller` is deliberately ignored here.
 *
 * In both collection modes Instacom retains exactly `charge`. That invariant is
 * the point of this function and is asserted directly in the tests.
 */
export function computeAmounts(
  config: ChargeConfig,
  fulfiller: ChargeFulfiller,
  amount: bigint,
  type: TransactionType = 'COLLECTION',
): TransactionAmounts {
  const charge = computeCharge(config, amount);

  if (type === 'DISBURSEMENT') {
    // The payee gets the full amount; the merchant's float covers amount + fee.
    return { amount, charge, netAmount: amount, totalAmount: amount, required: amount + charge };
  }

  const customerPays = fulfiller === 'SOURCE';
  const netAmount = customerPays ? amount : amount - charge; // CHG-4 / CHG-5
  if (netAmount < 0n) {
    throw new RangeError('charge exceeds amount for MERCHANT fulfiller');
  }
  const totalAmount = customerPays ? amount + charge : amount;

  // A collection spends no float; `required` stays amount + charge so the
  // DISBURSEMENT caller keeps one meaning for the field.
  return { amount, charge, netAmount, totalAmount, required: amount + charge };
}
