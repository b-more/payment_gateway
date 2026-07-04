// Airtel "Callback With Authentication" — HMAC verification.
//
// Airtel signs the callback with a shared key (set in the portal) and sends a
// `hash` field. The exact canonical form Airtel hashes isn't fully documented,
// so we compute SEVERAL candidate schemes and report which one matches. Run in
// log-only mode first (AIRTEL_CALLBACK_HASH_ENFORCE=false) to confirm the scheme
// against real callbacks, then enable enforcement and pin to the matched scheme.

import { createHmac } from 'node:crypto';

interface CallbackTxn {
  id?: string;
  status?: string;
  status_code?: string;
  airtel_money_id?: string;
  message?: string;
}
interface CallbackBody {
  hash?: unknown;
  transaction?: CallbackTxn;
  data?: { transaction?: CallbackTxn };
}

export interface CallbackHashCheck {
  provided: string | null; // the hash Airtel sent
  matched: string | null; // which candidate scheme matched (null = none)
  candidates: Record<string, string>; // scheme -> computed hex
}

export function checkCallbackHash(key: string, rawBody: string, body: CallbackBody): CallbackHashCheck {
  const provided =
    typeof body?.hash === 'string'
      ? body.hash
      : typeof (body?.transaction as { hash?: unknown } | undefined)?.hash === 'string'
        ? ((body.transaction as { hash?: string }).hash ?? null)
        : null;

  const t = body?.transaction ?? body?.data?.transaction ?? {};
  const status = t.status_code ?? t.status ?? '';
  const hmac = (data: string): string => createHmac('sha256', key).update(data, 'utf8').digest('hex');

  // Candidate canonical forms — whichever matches Airtel's `hash` is the scheme.
  const candidates: Record<string, string> = {
    rawBody: hmac(rawBody),
    transactionJson: hmac(JSON.stringify(t)),
    idStatusMoney: hmac(`${t.id ?? ''}${status}${t.airtel_money_id ?? ''}`),
    idMoney: hmac(`${t.id ?? ''}${t.airtel_money_id ?? ''}`),
    moneyIdStatus: hmac(`${t.airtel_money_id ?? ''}${status}`),
  };

  let matched: string | null = null;
  if (provided) {
    const p = provided.toLowerCase();
    for (const [name, val] of Object.entries(candidates)) {
      if (val.toLowerCase() === p) {
        matched = name;
        break;
      }
    }
  }
  return { provided, matched, candidates };
}
