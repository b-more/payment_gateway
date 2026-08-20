import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SmsService } from './sms.service';
import { ReceiptSmsService } from './receipt-sms.service';

@Module({
  imports: [DatabaseModule],
  providers: [SmsService, ReceiptSmsService],
  exports: [SmsService, ReceiptSmsService],
})
export class SmsModule {}
