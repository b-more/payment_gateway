import { createPool } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { zampayEnvConfig, zampayGlobalConfig } from '../zampay/zampay.config';
import { ZampayTokenManager } from '../zampay/zampay-token.manager';
import { ZampayClient } from '../zampay/zampay.client';
import { ZampayInvoiceService } from '../zampay/zampay-invoice.service';
import { ZampaySettlementService } from '../zampay/zampay-settlement.service';
import { ZampayOrchestrationService } from '../zampay/zampay-orchestration.service';

// ZamPay settlement reconciliation. Three passes, in order:
//   1. discover  — pick up successful ZamPay-account collections not yet tracked
//   2. resolve   — read invoices for NEW rows -> READY_TO_WIRE (operator worklist)
//   3. callbacks — send the settlement callback for WIRED rows
// Run via cron / the compose `tools` profile — never on app boot. Inert unless
// ZAMPAY_ENABLED=true.
async function main(): Promise<void> {
  if (!zampayGlobalConfig().enabled) {
    process.stdout.write('zampay reconcile: ZAMPAY_ENABLED not true — skipping\n');
    return;
  }

  const pool = createPool();
  const audit = new AuditService();
  const tokens = new ZampayTokenManager(zampayEnvConfig);
  const client = new ZampayClient(zampayEnvConfig, zampayGlobalConfig, tokens);
  const invoices = new ZampayInvoiceService(client);
  const settlement = new ZampaySettlementService(client, zampayGlobalConfig);
  const orchestration = new ZampayOrchestrationService(pool, invoices, settlement, audit);

  try {
    const discovered = await orchestration.discoverPending(zampayGlobalConfig().accountNumber);
    const { resolved, failed } = await orchestration.resolvePending();
    const { sent, failed: cbFailed } = await orchestration.sendDueCallbacks();
    process.stdout.write(
      `zampay reconcile: discovered=${discovered} resolved=${resolved} resolve_failed=${failed} ` +
        `callbacks_sent=${sent} callback_failed=${cbFailed}\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`zampay-reconcile failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
