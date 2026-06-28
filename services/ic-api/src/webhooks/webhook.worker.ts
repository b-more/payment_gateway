import {
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';

/**
 * Background driver for webhook delivery. Polls the queue, moving due retries to
 * ready and attempting them. Disabled with WEBHOOK_WORKER=off (e.g. in tests that
 * drive WebhookService directly).
 */
@Injectable()
export class WebhookWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly webhooks: WebhookService) {}

  onApplicationBootstrap(): void {
    if (process.env.WEBHOOK_WORKER === 'off') return;
    const pollMs = Number(process.env.WEBHOOK_POLL_MS ?? 1000);
    this.timer = setInterval(() => void this.tick(), pollMs);
    this.timer.unref(); // don't keep the process alive for the poller alone
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      await this.webhooks.pumpDueRetries();
      await this.webhooks.processReady(50);
    } catch {
      // transient queue/db errors are retried on the next tick
    }
  }
}
