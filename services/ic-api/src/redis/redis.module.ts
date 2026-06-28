import { Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS = Symbol('REDIS');

@Injectable()
class RedisCleanup implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly client: Redis) {}
  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

export function createRedis(url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'): Redis {
  const client = new Redis(url, {
    lazyConnect: true, // don't connect at boot; enqueue is best-effort (WH-3)
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  });
  // Surface connection problems via command rejections; avoid an unhandled 'error'.
  client.on('error', () => undefined);
  return client;
}

@Module({
  providers: [{ provide: REDIS, useFactory: () => createRedis() }, RedisCleanup],
  exports: [REDIS],
})
export class RedisModule {}
