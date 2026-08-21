import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SmsService } from './sms.service';
import { ReceiptSmsService } from './receipt-sms.service';
import { TransactionSmsNotifier } from './transaction-sms-notifier';

@Module({
  imports: [DatabaseModule],
  providers: [SmsService, ReceiptSmsService, TransactionSmsNotifier],
  exports: [SmsService, ReceiptSmsService, TransactionSmsNotifier],
})
export class SmsModule {}
