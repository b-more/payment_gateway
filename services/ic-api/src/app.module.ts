import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { MoneyModule } from './money.module';
import { ApiModule } from './api/api.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { SettlementModule } from './settlements/settlement.module';
import { AuthModule } from './auth/auth.module';
import { MerchantModule } from './merchant/merchant.module';
import { AirtelModule } from './airtel/airtel.module';

// Root module. MoneyModule holds the §5 engine; ApiModule the §8 /v1 HTTP surface;
// OnboardingModule the §5.1 merchant application; SettlementModule the §5.8/5.9
// jobs; AuthModule the §7 portal auth + RBAC; MerchantModule the §6.2 merchant
// portal API; HealthModule the liveness probe.
@Module({
  imports: [
    HealthModule,
    MoneyModule,
    ApiModule,
    OnboardingModule,
    SettlementModule,
    AuthModule,
    MerchantModule,
    AirtelModule,
  ],
})
export class AppModule {}
