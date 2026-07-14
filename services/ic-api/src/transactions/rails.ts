import { airtelGlobalConfig } from '../airtel/airtel.config';
import { mtnGlobalConfig } from '../mtn/mtn.config';
import { ValidationError } from '../money/errors';

/**
 * Rail readiness (single source of truth).
 *
 * processTransaction debits float and marks the transaction PROCESSING. If the
 * chosen rail then can't dispatch — it's disabled, or it's one of the processors
 * with no integration yet (ZAMTEL / ZED_MOBILE / VISA) — the money is stuck:
 * debited, never sent, never resolved. Every production money path must check
 * this BEFORE creating the transaction.
 */
export function isRailReady(processor: string): boolean {
  return (
    (processor === 'AIRTEL' && airtelGlobalConfig().enabled) ||
    (processor === 'MTN' && mtnGlobalConfig().enabled)
  );
}

export function assertRailReady(processor: string): void {
  if (!isRailReady(processor)) {
    throw new ValidationError(
      `${processor} is not available right now — nothing was charged and no funds were debited.`,
    );
  }
}
