import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MoneyModule } from '../money.module';
import { AirtelModule } from '../airtel/airtel.module';
import { MtnModule } from '../mtn/mtn.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { ApiAuthGuard } from './api-auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { ApiReadService } from './read.service';
import { PayoutService } from '../merchant/payout.service';
import { AuditService } from '../audit/audit.service';
import { SmsModule } from '../sms/sms.module';
import {
  AccountsController,
  CollectionsController,
  DisbursementsController,
  ReportsController,
  SettlementsController,
  TransactionsController,
} from './api.controllers';

// The §8 HTTP surface: six /v1 endpoints over the money engine, with HMAC auth.
@Module({
  imports: [DatabaseModule, MoneyModule, AirtelModule, MtnModule, CredentialsModule, SmsModule],
  controllers: [
    CollectionsController,
    DisbursementsController,
    TransactionsController,
    AccountsController,
    SettlementsController,
    ReportsController,
  ],
  providers: [ApiReadService, ApiAuthGuard, RateLimitGuard, PayoutService, AuditService],
})
export class ApiModule {}
