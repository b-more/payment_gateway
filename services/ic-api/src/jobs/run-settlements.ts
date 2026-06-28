import { createPool } from '../database/database.module';
import { LedgerService } from '../ledger/ledger.service';
import { AuditService } from '../audit/audit.service';
import { SettlementService } from '../settlements/settlement.service';

// Scheduled settlement run (SET-1). Invoke via cron / a compose one-shot — never
// on app boot. Uses DATABASE_URL (the admin role in production).
async function main(): Promise<void> {
  const pool = createPool();
  const service = new SettlementService(pool, new LedgerService(), new AuditService());
  try {
    const result = await service.runAll();
    process.stdout.write(`settlement run: created ${result.created} settlement(s)\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`settlement run failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
