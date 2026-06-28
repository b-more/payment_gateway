import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { WebhookService, WEBHOOK_CONFIG, type WebhookConfig } from './webhook.service';
import { WebhookWorker } from './webhook.worker';
import { DEFAULT_WEBHOOK_BACKOFF_SECONDS } from './webhook.signing';

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [
    WebhookService,
    WebhookWorker,
    {
      provide: WEBHOOK_CONFIG,
      useFactory: (): WebhookConfig => ({
        backoffSeconds: DEFAULT_WEBHOOK_BACKOFF_SECONDS,
        timeoutMs: Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000),
      }),
    },
  ],
  exports: [WebhookService],
})
export class WebhookModule {}
