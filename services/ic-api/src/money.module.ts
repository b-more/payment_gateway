import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { WebhookModule } from './webhooks/webhook.module';
import { LedgerService } from './ledger/ledger.service';
import { AuditService } from './audit/audit.service';
import { ProcessorService } from './processors/processor.service';
import { FloatService } from './float/float.service';
import { TransactionService } from './transactions/transaction.service';

// The §5 money engine. Services are framework-light (constructor injection) so
// they can also be exercised directly in integration tests with a pg pool.
@Module({
  imports: [DatabaseModule, WebhookModule],
  providers: [LedgerService, AuditService, ProcessorService, FloatService, TransactionService],
  exports: [FloatService, TransactionService, LedgerService, ProcessorService],
})
export class MoneyModule {}
