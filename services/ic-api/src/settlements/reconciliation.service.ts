import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import type { Processor } from '../money/types';

export interface ReportEntry {
  transactionId: string;
  processorStatus: string; // as reported by the MNO/processor (e.g. SUCCESS, FAILED)
  processorReference?: string | null;
}

export interface ReconciliationSummary {
  runId: string;
  matched: number;
  disputed: number;
  unmatched: number;
}

type ReconResult = 'MATCHED' | 'DISPUTED' | 'UNMATCHED';

interface StatusRow {
  status: string;
}

/**
 * Reconciliation (§5.9). Ingests a processor settlement report (REC-1), compares
 * each entry's status to the internal transaction status (REC-2), flags
 * mismatches DISPUTED for manual review (REC-3), and records a run summary of
 * matched / unmatched / disputed (REC-4).
 */
@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
  ) {}

  async run(input: {
    processor: Processor;
    report: ReportEntry[];
    actorId?: string | null;
  }): Promise<ReconciliationSummary> {
    return withTransaction(this.pool, async (client) => {
      const run = await client.query<{ id: string }>(
        'INSERT INTO reconciliation_runs (processor) VALUES ($1) RETURNING id',
        [input.processor],
      );
      const runId = run.rows[0].id;

      let matched = 0;
      let disputed = 0;
      let unmatched = 0;

      for (const entry of input.report) {
        const txn = await client.query<StatusRow>(
          'SELECT status FROM transactions WHERE id = $1 AND processor = $2',
          [entry.transactionId, input.processor],
        );

        if (txn.rowCount === 0) {
          unmatched += 1;
          await this.recordItem(client, runId, entry, null, 'UNMATCHED');
          continue;
        }

        const internalStatus = txn.rows[0].status;
        if (internalStatus === entry.processorStatus) {
          matched += 1;
          await this.recordItem(client, runId, entry, internalStatus, 'MATCHED');
        } else {
          disputed += 1; // REC-3
          await this.recordItem(client, runId, entry, internalStatus, 'DISPUTED');
          await this.audit.write(client, {
            actorId: input.actorId ?? null,
            actorScope: 'SYSTEM',
            action: 'RECONCILIATION_DISPUTE',
            target: entry.transactionId,
            metadata: { internalStatus, processorStatus: entry.processorStatus, runId },
          });
        }
      }

      await client.query(
        'UPDATE reconciliation_runs SET matched = $1, disputed = $2, unmatched = $3 WHERE id = $4',
        [matched, disputed, unmatched, runId],
      );
      await this.audit.write(client, {
        actorId: input.actorId ?? null,
        actorScope: 'SYSTEM',
        action: 'RECONCILIATION_RUN',
        target: runId,
        metadata: { processor: input.processor, matched, disputed, unmatched },
      });

      return { runId, matched, disputed, unmatched };
    });
  }

  private async recordItem(
    client: PoolClient,
    runId: string,
    entry: ReportEntry,
    internalStatus: string | null,
    result: ReconResult,
  ): Promise<void> {
    await client.query(
      `INSERT INTO reconciliation_items
         (run_id, transaction_id, processor_reference, internal_status, processor_status, result)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        runId,
        result === 'UNMATCHED' ? null : entry.transactionId,
        entry.processorReference ?? entry.transactionId,
        internalStatus,
        entry.processorStatus,
        result,
      ],
    );
  }
}
