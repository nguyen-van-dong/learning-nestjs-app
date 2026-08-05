/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access */
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type Redis from 'ioredis';
import { DynamicRateLimitGuard } from './guards/dynamic-rate-limit.guard';
import type { RateLimitContext } from './interfaces/rate-limit-context.interface';
import type {
  RateLimitPolicy,
  SystemLoadProvider,
  UserPlanProvider,
} from './interfaces/rate-limit-policy.interface';
import type { NormalizedRateLimitModuleOptions } from './interfaces/rate-limit-rule.interface';
import { SystemLoadRateLimitPolicy } from './policies/system-load-rate-limit.policy';
import { TimeRateLimitPolicy } from './policies/time-rate-limit.policy';
import { UserRateLimitPolicy } from './policies/user-rate-limit.policy';
import { RateLimitPolicyEngine } from './services/rate-limit-policy-engine.service';
import type { RateLimitService } from './services/rate-limit.service';
import { RedisFixedWindowStorage } from './storage/redis-fixed-window.storage';

const options = (
  overrides: Partial<NormalizedRateLimitModuleOptions> = {},
): NormalizedRateLimitModuleOptions => ({
  timezone: 'Asia/Ho_Chi_Minh',
  failureMode: 'fail-open',
  systemLoadTimeoutMs: 20,
  systemLoadCacheTtlMs: 0,
  systemLoadFallbackMultiplier: 1,
  debug: false,
  redis: { host: 'localhost', port: 6379, db: 0, keyPrefix: '' },
  timeRules: [
    { name: 'peak', start: '09:00', end: '11:00', multiplier: 0.5 },
    { name: 'night', start: '22:00', end: '00:00', multiplier: 1.5 },
  ],
  registerGlobalGuard: true,
  enableUserPolicy: false,
  ...overrides,
});

const context = (
  overrides: Partial<RateLimitContext> = {},
): RateLimitContext => ({
  routeKey: 'test.route',
  baseLimit: 100,
  ttlSeconds: 60,
  priority: 'normal',
  now: new Date('2026-08-04T02:30:00.000Z'),
  ip: '127.0.0.1',
  method: 'GET',
  path: '/test',
  request: {} as RateLimitContext['request'],
  ...overrides,
});

describe('RateLimitPolicyEngine', () => {
  it('keeps the base limit without policies', async () => {
    expect(
      (await new RateLimitPolicyEngine([]).resolve(context())).finalLimit,
    ).toBe(100);
  });

  it('sorts, skips and multiplies policies', async () => {
    const calls: string[] = [];
    const policy = (
      name: string,
      order: number,
      result: Awaited<ReturnType<RateLimitPolicy['evaluate']>>,
    ): RateLimitPolicy => ({
      name,
      order,
      evaluate: async () => {
        calls.push(name);
        return result;
      },
    });
    const engine = new RateLimitPolicyEngine([
      policy('second', 20, { applied: true, multiplier: 0.5, reason: 'b' }),
      policy('first', 10, { applied: false, reason: 'a' }),
      policy('third', 30, { applied: true, multiplier: 0.4, reason: 'c' }),
    ]);
    expect((await engine.resolve(context())).finalLimit).toBe(20);
    expect(calls).toEqual(['first', 'second', 'third']);
  });

  it('fails an invalid policy open and clamps the final limit to one', async () => {
    const invalid: RateLimitPolicy = {
      name: 'invalid',
      order: 1,
      evaluate: async () => ({ applied: true, multiplier: 0, reason: 'bad' }),
    };
    const tiny: RateLimitPolicy = {
      name: 'tiny',
      order: 2,
      evaluate: async () => ({
        applied: true,
        multiplier: 0.001,
        reason: 'tiny',
      }),
    };
    const result = await new RateLimitPolicyEngine([invalid, tiny]).resolve(
      context(),
    );
    expect(result.finalLimit).toBe(1);
    expect(result.appliedPolicies[0].applied).toBe(false);
  });
});

describe('TimeRateLimitPolicy', () => {
  it('uses Asia/Ho_Chi_Minh rather than the server timezone', async () => {
    const result = await new TimeRateLimitPolicy(options()).evaluate(context());
    expect(result).toMatchObject({ applied: true, multiplier: 0.5 });
  });

  it('matches a range ending at midnight', async () => {
    const result = await new TimeRateLimitPolicy(options()).evaluate(
      context({ now: new Date('2026-08-04T15:30:00.000Z') }),
    );
    expect(result).toMatchObject({ applied: true, multiplier: 1.5 });
  });

  it('skips when no rule matches', async () => {
    const result = await new TimeRateLimitPolicy(options()).evaluate(
      context({ now: new Date('2026-08-04T05:00:00.000Z') }),
    );
    expect(result.applied).toBe(false);
  });
});

describe('UserRateLimitPolicy', () => {
  const provider = (plan?: string): UserPlanProvider => ({
    getPlan: async () => plan,
  });

  it('skips anonymous and unknown plans', async () => {
    expect(
      (await new UserRateLimitPolicy(provider('pro')).evaluate(context()))
        .applied,
    ).toBe(false);
    expect(
      (
        await new UserRateLimitPolicy(provider('unknown')).evaluate(
          context({ userId: '1' }),
        )
      ).applied,
    ).toBe(false);
  });

  it.each([
    ['free', false, undefined],
    ['pro', true, 2],
    ['business', true, 5],
  ])('resolves %s plan', async (plan, applied, multiplier) => {
    const result = await new UserRateLimitPolicy(provider(plan)).evaluate(
      context({ userId: '1' }),
    );
    expect(result.applied).toBe(applied);
    if (result.applied) expect(result.multiplier).toBe(multiplier);
  });
});

describe('SystemLoadRateLimitPolicy', () => {
  it('skips low CPU and uses the most conservative metric', async () => {
    const low: SystemLoadProvider = {
      getSnapshot: async () => ({
        cpuUsagePercent: 20,
        measuredAt: new Date(),
      }),
    };
    expect(
      (await new SystemLoadRateLimitPolicy(low, options()).evaluate(context()))
        .applied,
    ).toBe(false);

    const loaded: SystemLoadProvider = {
      getSnapshot: async () => ({
        cpuUsagePercent: 85,
        queueWaitingJobs: 20_000,
        measuredAt: new Date(),
      }),
    };
    expect(
      await new SystemLoadRateLimitPolicy(loaded, options()).evaluate(
        context(),
      ),
    ).toMatchObject({ applied: true, multiplier: 0.3 });
  });

  it.each(['error', 'timeout'])('fails open on provider %s', async (mode) => {
    const provider: SystemLoadProvider = {
      getSnapshot:
        mode === 'error'
          ? async () => Promise.reject(new Error('unavailable'))
          : async () => new Promise(() => undefined),
    };
    expect(
      (
        await new SystemLoadRateLimitPolicy(provider, options()).evaluate(
          context(),
        )
      ).applied,
    ).toBe(false);
  });
});

describe('RedisFixedWindowStorage', () => {
  it('uses one atomic Lua call and computes limit fields safely', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([3, 25]),
      quit: jest.fn().mockResolvedValue('OK'),
    } as unknown as Redis;
    const result = await new RedisFixedWindowStorage(redis).consume({
      key: 'key',
      limit: 2,
      ttlSeconds: 60,
    });
    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(String((redis.eval as jest.Mock).mock.calls[0][0])).toContain(
      'EXPIRE',
    );
    expect(result).toMatchObject({ allowed: false, current: 3, remaining: 0 });
    expect(result.retryAfterSeconds).toBe(25);
  });

  it('falls back when Redis reports an invalid TTL', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, -1]),
      quit: jest.fn(),
    } as unknown as Redis;
    expect(
      (
        await new RedisFixedWindowStorage(redis).consume({
          key: 'key',
          limit: 2,
          ttlSeconds: 60,
        })
      ).retryAfterSeconds,
    ).toBe(60);
  });
});

describe('DynamicRateLimitGuard', () => {
  const execution = (request: Record<string, unknown>, response: object) =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'controller',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    }) as unknown as ExecutionContext;

  it('skips missing and disabled decorators', async () => {
    const service = { consume: jest.fn() } as unknown as RateLimitService;
    for (const metadata of [undefined, { enabled: false }]) {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(metadata),
      } as unknown as Reflector;
      expect(
        await new DynamicRateLimitGuard(
          reflector,
          service,
          options(),
        ).canActivate(execution({}, {})),
      ).toBe(true);
    }
    expect(service.consume).not.toHaveBeenCalled();
  });

  it('builds user identity, sets headers, and rejects with 429', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({
        key: 'reports.export',
        baseLimit: 20,
        ttlSeconds: 60,
      }),
    } as unknown as Reflector;
    const service = {
      consume: jest.fn().mockResolvedValue({
        identity: 'user:123',
        resolved: { finalLimit: 20, appliedPolicies: [] },
        result: {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: 25,
          resetAt: new Date('2026-08-04T16:00:00.000Z'),
        },
      }),
    } as unknown as RateLimitService;
    const headers: Record<string, unknown> = {};
    const response = {
      setHeader: (key: string, value: unknown) => (headers[key] = value),
    };
    const guard = new DynamicRateLimitGuard(reflector, service, options());
    await expect(
      guard.canActivate(
        execution(
          {
            user: { sub: 123 },
            headers: {},
            socket: {},
            method: 'POST',
            path: '/reports/export',
          },
          response,
        ),
      ),
    ).rejects.toMatchObject({ status: 429 } as HttpException);
    expect(service.consume).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '123', routeKey: 'reports.export' }),
    );
    expect(headers).toMatchObject({
      'X-RateLimit-Limit': 20,
      'X-RateLimit-Remaining': 0,
      'Retry-After': 25,
    });
  });

  it.each([
    ['fail-open', true],
    ['fail-closed', false],
  ] as const)(
    'handles storage errors in %s mode',
    async (failureMode, allowed) => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue({
          key: 'route',
          baseLimit: 1,
          ttlSeconds: 1,
        }),
      } as unknown as Reflector;
      const service = {
        consume: jest.fn().mockRejectedValue(new Error('redis down')),
      } as unknown as RateLimitService;
      const guard = new DynamicRateLimitGuard(
        reflector,
        service,
        options({ failureMode }),
      );
      const promise = guard.canActivate(
        execution(
          { headers: {}, socket: {}, method: 'GET', path: '/' },
          { setHeader: jest.fn() },
        ),
      );
      if (allowed) await expect(promise).resolves.toBe(true);
      else
        await expect(promise).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
    },
  );
});
