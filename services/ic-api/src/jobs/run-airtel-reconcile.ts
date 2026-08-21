import { createPool } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { ProcessorService } from '../processors/processor.service';
import { WebhookService } from '../webhooks/webhook.service';
import { createRedis } from '../redis/redis.module';
import { TransactionService } from '../transactions/transaction.service';
import { SmsService } from '../sms/sms.service';
import { TransactionSmsNotifier } from '../sms/transaction-sms-notifier';
import { AirtelAttemptsRepository } from '../airtel/airtel-attempts.repository';
import { AirtelClient } from '../airtel/airtel.client';
import { AirtelTokenManager } from '../airtel/airtel-token.manager';
import { AirtelPaymentsService } from '../airtel/airtel-payments.service';
import { AirtelDisbursementsService } from '../airtel/airtel-disbursements.service';
import { AirtelDispatchService } from '../airtel/airtel-dispatch.service';
import { airtelEnvConfig, airtelGlobalConfig } from '../airtel/airtel.config';

// Airtel reconciliation (§ RECONCILIATION). Re-enquires every non-final attempt,
// resolves the ones that reached a final Airtel status, and reports anything
// still unresolved and older than AIRTEL_RECON_STALE_HOURS. Run via cron / the
// compose `tools` profile — never on app boot.
//
//   AIRTEL_RECON_MIN_AGE_SEC=30     only touch attempts idle > this (avoid racing live flow)
//   AIRTEL_RECON_STALE_HOURS=6      flag unresolved attempts older than this
async function main(): Promise<void> {
  const minAgeSec = Number(process.env.AIRTEL_RECON_MIN_AGE_SEC ?? '30');
  const staleHours = Number(process.env.AIRTEL_RECON_STALE_HOURS ?? '6');

  const pool = createPool();
  const redis = createRedis();
  const audit = new AuditService();
  const attempts = new AirtelAttemptsRepository(pool);
  const tokens = new AirtelTokenManager(airtelEnvConfig);
  const client = new AirtelClient(airtelEnvConfig, airtelGlobalConfig, tokens);
  const webhooks = new WebhookService(pool, redis, {
    backoffSeconds: [60, 300, 1800, 7200],
    timeoutMs: Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000),
  });
  // Wire the SMS notifier so a late approval resolved here still texts the customer.
  const txns = new TransactionService(
    pool, new LedgerService(), audit, new ProcessorService(), webhooks,
    new TransactionSmsNotifier(pool, new SmsService()),
  );
  const dispatch = new AirtelDispatchService(
    new AirtelPaymentsService(client, attempts, airtelEnvConfig, airtelGlobalConfig),
    new AirtelDisbursementsService(client, attempts, airtelEnvConfig),
    attempts,
    txns,
  );

  try {
    const pending = await attempts.listUnresolved(minAgeSec);
    let resolved = 0;
    const stale: string[] = [];
    const staleMs = staleHours * 3600 * 1000;

    for (const a of pending) {
      const before = a.state;
      try {
        const outcome = await dispatch.resolveByAirtelTxnId(a.airtelTxnId);
        if (outcome && (outcome.state === 'SUCCESS' || outcome.state === 'FAILED')) resolved++;
      } catch (e) {
        process.stderr.write(`  enquire failed ${a.airtelTxnId}: ${e instanceof Error ? e.message : String(e)}\n`);
      }
      // Report row (log-safe): date, our id, airtel_money_id, amount, status, ref.
      process.stdout.write(
        `  ${a.airtelTxnId}\t${a.airtelMoneyId ?? '-'}\t${a.amountNgwee ?? '-'}\t${before}\ttxn=${a.transactionId ?? '-'}\n`,
      );
    }

    // Anything still unresolved and old is flagged for a human.
    const stillOpen = await attempts.listUnresolved(Math.max(minAgeSec, Math.floor(staleMs / 1000)));
    for (const a of stillOpen) stale.push(a.airtelTxnId);

    process.stdout.write(
      `airtel reconcile: checked=${pending.length} resolved=${resolved} stale(>${staleHours}h)=${stale.length}\n`,
    );
    if (stale.length > 0) process.stdout.write(`  STALE: ${stale.join(', ')}\n`);
  } finally {
    await redis.quit();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`airtel-reconcile failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
