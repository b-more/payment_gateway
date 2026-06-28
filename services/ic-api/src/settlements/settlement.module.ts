import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MoneyModule } from '../money.module';
import { AuditService } from '../audit/audit.service';
import { SettlementService } from './settlement.service';
import { ReconciliationService } from './reconciliation.service';

// Settlement (§5.8) and reconciliation (§5.9). Exported for the admin portal /
// scheduled jobs. No HTTP controllers yet — these are admin/RECONCILIATION
// operations that require portal auth (§7).
@Module({
  imports: [DatabaseModule, MoneyModule], // MoneyModule exports LedgerService
  providers: [SettlementService, ReconciliationService, AuditService],
  exports: [SettlementService, ReconciliationService],
})
export class SettlementModule {}
