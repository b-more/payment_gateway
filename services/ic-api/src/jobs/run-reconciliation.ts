import { readFileSync } from 'node:fs';
import { createPool } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { ReconciliationService, type ReportEntry } from '../settlements/reconciliation.service';
import type { Processor } from '../money/types';

// Daily reconciliation run (REC-1). Reads a processor settlement report (JSON)
// and reconciles it against internal transactions. Invoke via cron / one-shot.
//
//   RECON_REPORT_FILE=/reports/mtn.json  (default ./recon-report.json)
//   Report shape: { "processor": "MTN", "entries": [ { "transactionId", "processorStatus", "processorReference"? } ] }

interface ReportFile {
  processor: Processor;
  entries: ReportEntry[];
}

async function main(): Promise<void> {
  const file = process.env.RECON_REPORT_FILE ?? 'recon-report.json';
  const report = JSON.parse(readFileSync(file, 'utf8')) as ReportFile;

  const pool = createPool();
  const service = new ReconciliationService(pool, new AuditService());
  try {
    const summary = await service.run({ processor: report.processor, report: report.entries });
    process.stdout.write(
      `reconciliation ${report.processor}: matched=${summary.matched} disputed=${summary.disputed} unmatched=${summary.unmatched}\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`reconciliation failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
