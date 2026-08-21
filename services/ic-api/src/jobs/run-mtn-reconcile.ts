import { createPool } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { ProcessorService } from '../processors/processor.service';
import { WebhookService } from '../webhooks/webhook.service';
import { createRedis } from '../redis/redis.module';
import { TransactionService } from '../transactions/transaction.service';
import { SmsService } from '../sms/sms.service';
import { TransactionSmsNotifier } from '../sms/transaction-sms-notifier';
import { MtnAttemptsRepository } from '../mtn/mtn-attempts.repository';
import { MtnClient } from '../mtn/mtn.client';
import { MtnTokenManager } from '../mtn/mtn-token.manager';
import { MtnCollectionsService } from '../mtn/mtn-collections.service';
import { MtnDisbursementsService } from '../mtn/mtn-disbursements.service';
import { MtnDispatchService } from '../mtn/mtn-dispatch.service';
import { mtnProductConfig, mtnGlobalConfig } from '../mtn/mtn.config';

// MTN reconciliation: re-poll every non-final attempt and resolve those that
// reached a final status. Run via cron / the compose `tools` profile.
async function main(): Promise<void> {
  const minAgeSec = Number(process.env.MTN_RECON_MIN_AGE_SEC ?? '30');
  const staleHours = Number(process.env.MTN_RECON_STALE_HOURS ?? '6');

  const pool = createPool();
  const redis = createRedis();
  const attempts = new MtnAttemptsRepository(pool);
  const tokens = new MtnTokenManager(mtnProductConfig);
  const collections = new MtnCollectionsService(
    new MtnClient('COLLECTION', mtnProductConfig, mtnGlobalConfig, tokens),
    attempts,
    () => mtnProductConfig('COLLECTION'),
    mtnGlobalConfig,
  );
  const disbursements = new MtnDisbursementsService(
    new MtnClient('DISBURSEMENT', mtnProductConfig, mtnGlobalConfig, tokens),
    attempts,
    () => mtnProductConfig('DISBURSEMENT'),
    mtnGlobalConfig,
  );
  const webhooks = new WebhookService(pool, redis, {
    backoffSeconds: [60, 300, 1800, 7200],
    timeoutMs: Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000),
  });
  // Wire the SMS notifier so a late approval resolved here still texts the customer.
  const txns = new TransactionService(
    pool, new LedgerService(), new AuditService(), new ProcessorService(), webhooks,
    new TransactionSmsNotifier(pool, new SmsService()),
  );
  const dispatch = new MtnDispatchService(collections, disbursements, attempts, txns);

  try {
    const pending = await attempts.listUnresolved(minAgeSec);
    let resolved = 0;
    for (const a of pending) {
      try {
        const outcome = await dispatch.resolveByRefId(a.mtnRefId);
        if (outcome && (outcome.state === 'SUCCESS' || outcome.state === 'FAILED')) resolved++;
      } catch (e) {
        process.stderr.write(`  status failed ${a.mtnRefId}: ${e instanceof Error ? e.message : String(e)}\n`);
      }
      process.stdout.write(
        `  ${a.mtnRefId}\t${a.financialTransactionId ?? '-'}\t${a.amountNgwee ?? '-'}\t${a.state}\ttxn=${a.transactionId ?? '-'}\n`,
      );
    }
    const stillOpen = await attempts.listUnresolved(Math.max(minAgeSec, staleHours * 3600));
    process.stdout.write(
      `mtn reconcile: checked=${pending.length} resolved=${resolved} stale(>${staleHours}h)=${stillOpen.length}\n`,
    );
    if (stillOpen.length > 0) process.stdout.write(`  STALE: ${stillOpen.map((a) => a.mtnRefId).join(', ')}\n`);
  } finally {
    await redis.quit();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`mtn-reconcile failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
