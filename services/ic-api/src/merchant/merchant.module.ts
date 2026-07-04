import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { AuthModule } from '../auth/auth.module';
import { ReportModule } from '../reports/report.module';
import { MoneyModule } from '../money.module';
import { AirtelModule } from '../airtel/airtel.module';
import { MtnModule } from '../mtn/mtn.module';
import { AuditService } from '../audit/audit.service';
import { MerchantReadService } from './merchant-read.service';
import { PayoutService } from './payout.service';
import { MerchantController } from './merchant.controller';

// Merchant portal API (§6.2). AuthModule provides the JWT/roles guards; all
// queries are merchant-scoped (NN-6).
@Module({
  imports: [DatabaseModule, CredentialsModule, AuthModule, ReportModule, MoneyModule, AirtelModule, MtnModule],
  controllers: [MerchantController],
  providers: [MerchantReadService, PayoutService, AuditService],
})
export class MerchantModule {}
