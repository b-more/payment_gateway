import { randomUUID } from 'node:crypto';
import { mtnProductConfig, mtnGlobalConfig, assertMtnProductCredentials } from '../mtn/mtn.config';
import { MtnTokenManager } from '../mtn/mtn-token.manager';
import { MtnClient } from '../mtn/mtn.client';
import { MtnCollectionsService } from '../mtn/mtn-collections.service';
import { MtnDisbursementsService } from '../mtn/mtn-disbursements.service';
import { assertAttemptTransition, isFinalAttemptState } from '../mtn/mtn-attempt';
import type { MtnAttempt, MtnAttemptStore, CreateAttemptInput, TransitionPatch } from '../mtn/mtn-attempts.store';

// Direct MTN smoke test — real .env credentials, in-memory attempts, no engine/DB.
//   node dist/jobs/mtn-smoke.js collect  260975020473 150 [ref]   # 150 ngwee = K1.50
//   node dist/jobs/mtn-smoke.js disburse 260975020473 500 [ref]

class MemStore implements MtnAttemptStore {
  private readonly rows = new Map<string, MtnAttempt>();
  private seq = 0;
  async create(input: CreateAttemptInput): Promise<MtnAttempt> {
    const id = `mem${++this.seq}`;
    const row: MtnAttempt = {
      id, transactionId: input.transactionId, direction: input.direction, mtnEnv: input.mtnEnv,
      msisdn: input.msisdn, amountNgwee: input.amountNgwee, mtnRefId: input.mtnRefId,
      externalId: input.externalId, attemptNo: input.attemptNo, state: 'CREATED',
      financialTransactionId: null, reason: null,
    };
    this.rows.set(id, row);
    return { ...row };
  }
  async transition(attemptId: string, patch: TransitionPatch): Promise<MtnAttempt> {
    const row = this.rows.get(attemptId);
    if (!row) throw new Error('attempt not found');
    assertAttemptTransition(row.state, patch.to);
    row.state = patch.to;
    if (patch.financialTransactionId != null) row.financialTransactionId = patch.financialTransactionId;
    if (patch.reason != null) row.reason = patch.reason;
    return { ...row };
  }
  async findByRefId(refId: string): Promise<MtnAttempt | null> {
    for (const r of this.rows.values()) if (r.mtnRefId === refId) return { ...r };
    return null;
  }
  async latestAttemptNo(): Promise<number> {
    return 0;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const [op, arg1, arg2, arg3] = process.argv.slice(2);
  process.stdout.write(`mtn smoke: env=${mtnProductConfig('COLLECTION').env} target=${mtnGlobalConfig().targetEnvironment}\n`);
  const tokens = new MtnTokenManager(mtnProductConfig);
  const store = new MemStore();
  const collections = new MtnCollectionsService(new MtnClient('COLLECTION', mtnProductConfig, mtnGlobalConfig, tokens), store, () => mtnProductConfig('COLLECTION'), mtnGlobalConfig);
  const disb = new MtnDisbursementsService(new MtnClient('DISBURSEMENT', mtnProductConfig, mtnGlobalConfig, tokens), store, () => mtnProductConfig('DISBURSEMENT'), mtnGlobalConfig);

  if (op !== 'collect' && op !== 'disburse') {
    process.stderr.write('usage: mtn-smoke <collect|disburse> <msisdn> <amountNgwee> [ref]\n');
    process.exitCode = 2;
    return;
  }
  const msisdn = req(arg1, 'msisdn');
  const amountNgwee = BigInt(req(arg2, 'amountNgwee'));
  const externalId = (arg3 ?? `SMOKE${Date.now()}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
  const txnId = randomUUID();
  assertMtnProductCredentials(mtnProductConfig(op === 'collect' ? 'COLLECTION' : 'DISBURSEMENT'));

  const outcome =
    op === 'collect'
      ? await collections.initiateCollection({ transactionId: txnId, msisdn, amountNgwee, externalId })
      : await disb.initiateDisbursement({ transactionId: txnId, payeeMsisdn: msisdn, amountNgwee, externalId, approvalRef: 'smoke-cli' });
  process.stdout.write(`initiated: ref=${outcome.mtnRefId} state=${outcome.state}\n`);

  const svc = op === 'collect' ? collections : disb;
  for (const wait of [8_000, 12_000, 20_000, 30_000]) {
    if (isFinalAttemptState(outcome.state)) break;
    process.stdout.write(`  waiting ${wait / 1000}s then polling status...\n`);
    await sleep(wait);
    const s = await svc.status(outcome.mtnRefId);
    process.stdout.write(`  status: state=${s.state} finId=${s.financialTransactionId ?? '-'} reason=${s.reason ?? '-'}\n`);
    if (isFinalAttemptState(s.state)) {
      process.stdout.write(`FINAL: ${s.state}\n`);
      return;
    }
  }
  process.stdout.write('still not final — run reconcile later or check the MTN portal.\n');
}

function req(v: string | undefined, name: string): string {
  if (!v) throw new Error(`missing argument: ${name}`);
  return v;
}

main().catch((e: unknown) => {
  process.stderr.write(`mtn-smoke failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
