import { randomUUID } from 'node:crypto';
import { airtelEnvConfig, airtelGlobalConfig, assertAirtelCredentials } from '../airtel/airtel.config';
import { AirtelTokenManager } from '../airtel/airtel-token.manager';
import { AirtelClient } from '../airtel/airtel.client';
import { AirtelPaymentsService } from '../airtel/airtel-payments.service';
import { AirtelDisbursementsService } from '../airtel/airtel-disbursements.service';
import { AirtelKycService } from '../airtel/airtel-kyc.service';
import { AirtelBalanceService } from '../airtel/airtel-balance.service';
import { assertAttemptTransition, isFinalAttemptState } from '../airtel/airtel-attempt';
import type { AirtelAttempt, AirtelAttemptStore, CreateAttemptInput, TransitionPatch } from '../airtel/airtel-attempts.store';

// Direct Airtel smoke test (deliverable #4). Calls Airtel with the real .env
// credentials, WITHOUT the transaction engine / DB — attempts live in memory —
// so you can validate collection & disbursement quickly with tiny amounts.
//
//   node dist/jobs/airtel-smoke.js kyc      260975020473
//   node dist/jobs/airtel-smoke.js collect  260975020473 150         # 150 ngwee = K1.50
//   node dist/jobs/airtel-smoke.js disburse 260975020473 500 [ref]   # 500 ngwee = K5.00
//   node dist/jobs/airtel-smoke.js balance  COLL
//
// For a collection the payer must approve the USSD/PIN prompt on their phone
// while this polls the enquiry.

class MemStore implements AirtelAttemptStore {
  private readonly rows = new Map<string, AirtelAttempt>();
  private seq = 0;
  async create(input: CreateAttemptInput): Promise<AirtelAttempt> {
    const id = `mem${++this.seq}`;
    const row: AirtelAttempt = {
      id, transactionId: input.transactionId, direction: input.direction, airtelEnv: input.airtelEnv,
      msisdn: input.msisdn, amountNgwee: input.amountNgwee, airtelTxnId: input.airtelTxnId,
      attemptNo: input.attemptNo, state: 'CREATED', airtelMoneyId: null, resultCode: null,
      requestId: null, failureReason: null,
    };
    this.rows.set(id, row);
    return { ...row };
  }
  async transition(attemptId: string, patch: TransitionPatch): Promise<AirtelAttempt> {
    const row = this.rows.get(attemptId);
    if (!row) throw new Error('attempt not found');
    assertAttemptTransition(row.state, patch.to);
    row.state = patch.to;
    if (patch.airtelMoneyId != null) row.airtelMoneyId = patch.airtelMoneyId;
    if (patch.failureReason != null) row.failureReason = patch.failureReason;
    if (patch.resultCode != null) row.resultCode = patch.resultCode;
    if (patch.requestId != null) row.requestId = patch.requestId;
    return { ...row };
  }
  async findByAirtelTxnId(id: string): Promise<AirtelAttempt | null> {
    for (const r of this.rows.values()) if (r.airtelTxnId === id) return { ...r };
    return null;
  }
  async latestAttemptNo(): Promise<number> {
    return 0;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const [op, arg1, arg2, arg3] = process.argv.slice(2);
  const cfg = airtelEnvConfig();
  assertAirtelCredentials(cfg);
  process.stdout.write(`airtel smoke: env=${cfg.env} base=${cfg.baseUrl}\n`);

  const tokens = new AirtelTokenManager(airtelEnvConfig);
  const client = new AirtelClient(airtelEnvConfig, airtelGlobalConfig, tokens);
  const store = new MemStore();
  const payments = new AirtelPaymentsService(client, store, airtelEnvConfig, airtelGlobalConfig);
  const disb = new AirtelDisbursementsService(client, store, airtelEnvConfig);

  if (op === 'kyc') {
    const r = await new AirtelKycService(client).validatePayer(req(arg1, 'msisdn'));
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    return;
  }
  if (op === 'balance') {
    const r = await new AirtelBalanceService(client, airtelGlobalConfig).balance(arg1 === 'DISB' ? 'DISB' : 'COLL');
    process.stdout.write(JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n');
    return;
  }
  if (op === 'collect' || op === 'disburse') {
    const msisdn = req(arg1, 'msisdn');
    const amountNgwee = BigInt(req(arg2, 'amountNgwee'));
    const reference = arg3 ?? `SMOKE-${op.toUpperCase()}-${Date.now()}`;
    const txnId = randomUUID();

    const outcome =
      op === 'collect'
        ? await payments.initiateCollection({ transactionId: txnId, msisdn, amountNgwee, reference })
        : await disb.initiateDisbursement({ transactionId: txnId, payeeMsisdn: msisdn, amountNgwee, reference, approvalRef: 'smoke-cli' });
    process.stdout.write(`initiated: id=${outcome.airtelTxnId} state=${outcome.state} moneyId=${outcome.airtelMoneyId ?? '-'}\n`);

    // Poll enquiry until final (or give up). The payer approves on their phone.
    for (const wait of [10_000, 15_000, 20_000, 30_000]) {
      if (isFinalAttemptState(outcome.state)) break;
      process.stdout.write(`  waiting ${wait / 1000}s then enquiring...\n`);
      await sleep(wait);
      const e = op === 'collect' ? await payments.enquire(outcome.airtelTxnId) : await disb.enquireDisbursement(outcome.airtelTxnId);
      process.stdout.write(`  enquiry: state=${e.state} moneyId=${e.airtelMoneyId ?? '-'} reason=${e.failureReason ?? '-'}\n`);
      if (isFinalAttemptState(e.state)) {
        process.stdout.write(`FINAL: ${e.state}\n`);
        return;
      }
    }
    process.stdout.write('still not final — run reconcile later or check the Airtel portal.\n');
    return;
  }

  process.stderr.write('usage: airtel-smoke <kyc|balance|collect|disburse> <args...>\n');
  process.exitCode = 2;
}

function req(v: string | undefined, name: string): string {
  if (!v) throw new Error(`missing argument: ${name}`);
  return v;
}

main().catch((e: unknown) => {
  process.stderr.write(`airtel-smoke failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
