import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { zampayEnvConfig, zampayGlobalConfig } from './zampay.config';
import { ZampayTokenManager } from './zampay-token.manager';
import { ZampayClient } from './zampay.client';
import { ZampayInvoiceService } from './zampay-invoice.service';
import { ZampaySettlementService } from './zampay-settlement.service';
import { ZampayOrchestrationService } from './zampay-orchestration.service';

// ZamPay (GSB) settlement processor. The token manager and client are process
// singletons (token cache); services read env config lazily so base URL /
// credentials stay swappable per environment. Orchestration only does anything
// for accounts flagged zampay_settlement_enabled, and only when the reconcile
// job runs — otherwise this module is inert.
@Module({
  imports: [DatabaseModule],
  providers: [
    AuditService,
    { provide: ZampayTokenManager, useFactory: () => new ZampayTokenManager(zampayEnvConfig) },
    {
      provide: ZampayClient,
      useFactory: (tm: ZampayTokenManager) => new ZampayClient(zampayEnvConfig, zampayGlobalConfig, tm),
      inject: [ZampayTokenManager],
    },
    {
      provide: ZampayInvoiceService,
      useFactory: (c: ZampayClient) => new ZampayInvoiceService(c),
      inject: [ZampayClient],
    },
    {
      provide: ZampaySettlementService,
      useFactory: (c: ZampayClient) => new ZampaySettlementService(c, zampayGlobalConfig),
      inject: [ZampayClient],
    },
    ZampayOrchestrationService,
  ],
  exports: [ZampayOrchestrationService, ZampayInvoiceService, ZampaySettlementService],
})
export class ZampayModule {}
