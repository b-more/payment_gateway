import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { WebhookModule } from './webhooks/webhook.module';
import { LedgerService } from './ledger/ledger.service';
import { AuditService } from './audit/audit.service';
import { ProcessorService } from './processors/processor.service';
import { FloatService } from './float/float.service';
import { TransactionService, TRANSACTION_NOTIFIER } from './transactions/transaction.service';
import { SmsModule } from './sms/sms.module';
import { TransactionSmsNotifier } from './sms/transaction-sms-notifier';

// The §5 money engine. Services are framework-light (constructor injection) so
// they can also be exercised directly in integration tests with a pg pool.
@Module({
  imports: [DatabaseModule, WebhookModule, SmsModule],
  providers: [
    LedgerService, AuditService, ProcessorService, FloatService, TransactionService,
    // Wire the SMS notifier so completeTransaction texts the customer on resolve.
    { provide: TRANSACTION_NOTIFIER, useExisting: TransactionSmsNotifier },
  ],
  exports: [FloatService, TransactionService, LedgerService, ProcessorService],
})
export class MoneyModule {}
