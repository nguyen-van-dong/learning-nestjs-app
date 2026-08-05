import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { RATE_LIMIT_REDIS } from '../constants/rate-limit.constants';
import type {
  RateLimitStorage,
  RateLimitStorageResult,
} from '../interfaces/rate-limit-storage.interface';

const CONSUME_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

@Injectable()
export class RedisFixedWindowStorage
  implements RateLimitStorage, OnModuleDestroy
{
  constructor(@Inject(RATE_LIMIT_REDIS) private readonly redis: Redis) {}

  async consume(input: {
    key: string;
    limit: number;
    ttlSeconds: number;
  }): Promise<RateLimitStorageResult> {
    // Lua keeps increment, first-request expiry, and TTL lookup atomic.
    const raw = (await this.redis.eval(
      CONSUME_SCRIPT,
      1,
      input.key,
      input.ttlSeconds,
    )) as [number | string, number | string];
    const current = Number(raw[0]);
    const reportedTtl = Number(raw[1]);
    const retryAfterSeconds = reportedTtl > 0 ? reportedTtl : input.ttlSeconds;
    return {
      allowed: current <= input.limit,
      current,
      remaining: Math.max(0, input.limit - current),
      retryAfterSeconds,
      resetAt: new Date(Date.now() + retryAfterSeconds * 1000),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
