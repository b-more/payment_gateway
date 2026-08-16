import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { AuthModule } from '../auth/auth.module';
import { ReportModule } from '../reports/report.module';
import { MoneyModule } from '../money.module';
import { AirtelModule } from '../airtel/airtel.module';
import { MtnModule } from '../mtn/mtn.module';
import { EmailModule } from '../email/email.module';
import { DeviceModule } from '../devices/device.module';
import { AuditService } from '../audit/audit.service';
import { MerchantReadService } from './merchant-read.service';
import { PayoutService } from './payout.service';
import { MerchantUserService } from './merchant-user.service';
import { MerchantController } from './merchant.controller';

// Merchant portal API (§6.2). AuthModule provides the JWT/roles guards; all
// queries are merchant-scoped (NN-6).
@Module({
  imports: [DatabaseModule, CredentialsModule, AuthModule, ReportModule, MoneyModule, AirtelModule, MtnModule, EmailModule, DeviceModule],
  controllers: [MerchantController],
  providers: [MerchantReadService, PayoutService, MerchantUserService, AuditService],
})
export class MerchantModule {}
