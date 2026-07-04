import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MoneyModule } from '../money.module';
import { mtnGlobalConfig, mtnProductConfig } from './mtn.config';
import { MtnTokenManager } from './mtn-token.manager';
import { MtnClient } from './mtn.client';
import { MtnAttemptsRepository } from './mtn-attempts.repository';
import { MtnCollectionsService } from './mtn-collections.service';
import { MtnDisbursementsService } from './mtn-disbursements.service';
import { MtnDispatchService } from './mtn-dispatch.service';

// MTN MoMo processor. Per-product tokens/clients (COLLECTION, DISBURSEMENT) built
// from env config. Only PRODUCTION accounts reach MTN, and only when MTN_ENABLED.
@Module({
  imports: [DatabaseModule, MoneyModule],
  providers: [
    MtnAttemptsRepository,
    { provide: MtnTokenManager, useFactory: () => new MtnTokenManager(mtnProductConfig) },
    {
      provide: MtnCollectionsService,
      useFactory: (tm: MtnTokenManager, repo: MtnAttemptsRepository) =>
        new MtnCollectionsService(
          new MtnClient('COLLECTION', mtnProductConfig, mtnGlobalConfig, tm),
          repo,
          () => mtnProductConfig('COLLECTION'),
          mtnGlobalConfig,
        ),
      inject: [MtnTokenManager, MtnAttemptsRepository],
    },
    {
      provide: MtnDisbursementsService,
      useFactory: (tm: MtnTokenManager, repo: MtnAttemptsRepository) =>
        new MtnDisbursementsService(
          new MtnClient('DISBURSEMENT', mtnProductConfig, mtnGlobalConfig, tm),
          repo,
          () => mtnProductConfig('DISBURSEMENT'),
          mtnGlobalConfig,
        ),
      inject: [MtnTokenManager, MtnAttemptsRepository],
    },
    MtnDispatchService,
  ],
  exports: [MtnDispatchService, MtnCollectionsService, MtnDisbursementsService],
})
export class MtnModule {}
