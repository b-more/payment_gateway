import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RateLimitGuard } from '../api/rate-limit.guard';
import { ReceiptController } from './receipt.controller';

// Public HTML receipt page (the receipt QR target).
@Module({
  imports: [DatabaseModule],
  controllers: [ReceiptController],
  providers: [RateLimitGuard],
})
export class ReceiptModule {}
