import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MoneyModule } from '../money.module';
import { RateLimitGuard } from '../api/rate-limit.guard';
import { airtelEnvConfig, airtelGlobalConfig } from './airtel.config';
import { AirtelTokenManager } from './airtel-token.manager';
import { AirtelClient } from './airtel.client';
import { AirtelAttemptsRepository } from './airtel-attempts.repository';
import { AirtelPaymentsService } from './airtel-payments.service';
import { AirtelDisbursementsService } from './airtel-disbursements.service';
import { AirtelKycService } from './airtel-kyc.service';
import { AirtelBalanceService } from './airtel-balance.service';
import { AirtelDispatchService } from './airtel-dispatch.service';
import { AirtelCallbackController } from './airtel-callback.controller';

// Airtel Zambia processor. The token manager and client are process singletons
// (token cache); the services read env config lazily so base URL / credentials /
// keys stay swappable per environment. Live dispatch only happens for PRODUCTION
// accounts and only when AIRTEL_ENABLED=true — otherwise this is inert.
@Module({
  imports: [DatabaseModule, MoneyModule],
  controllers: [AirtelCallbackController],
  providers: [
    AirtelAttemptsRepository,
    RateLimitGuard,
    { provide: AirtelTokenManager, useFactory: () => new AirtelTokenManager(airtelEnvConfig) },
    {
      provide: AirtelClient,
      useFactory: (tm: AirtelTokenManager) => new AirtelClient(airtelEnvConfig, airtelGlobalConfig, tm),
      inject: [AirtelTokenManager],
    },
    {
      provide: AirtelPaymentsService,
      useFactory: (c: AirtelClient, r: AirtelAttemptsRepository) =>
        new AirtelPaymentsService(c, r, airtelEnvConfig, airtelGlobalConfig),
      inject: [AirtelClient, AirtelAttemptsRepository],
    },
    {
      provide: AirtelDisbursementsService,
      useFactory: (c: AirtelClient, r: AirtelAttemptsRepository) =>
        new AirtelDisbursementsService(c, r, airtelEnvConfig),
      inject: [AirtelClient, AirtelAttemptsRepository],
    },
    {
      provide: AirtelKycService,
      useFactory: (c: AirtelClient) => new AirtelKycService(c),
      inject: [AirtelClient],
    },
    {
      provide: AirtelBalanceService,
      useFactory: (c: AirtelClient) => new AirtelBalanceService(c, airtelGlobalConfig),
      inject: [AirtelClient],
    },
    AirtelDispatchService,
  ],
  exports: [
    AirtelDispatchService,
    AirtelKycService,
    AirtelBalanceService,
    AirtelPaymentsService,
    AirtelDisbursementsService,
  ],
})
export class AirtelModule {}
