import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MoneyModule } from '../money.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { ApiAuthGuard } from './api-auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { ApiReadService } from './read.service';
import {
  AccountsController,
  CollectionsController,
  DisbursementsController,
  SettlementsController,
  TransactionsController,
} from './api.controllers';

// The §8 HTTP surface: six /v1 endpoints over the money engine, with HMAC auth.
@Module({
  imports: [DatabaseModule, MoneyModule, CredentialsModule],
  controllers: [
    CollectionsController,
    DisbursementsController,
    TransactionsController,
    AccountsController,
    SettlementsController,
  ],
  providers: [ApiReadService, ApiAuthGuard, RateLimitGuard],
})
export class ApiModule {}
