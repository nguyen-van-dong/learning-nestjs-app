import {
  DynamicModule,
  FactoryProvider,
  Module,
  ModuleMetadata,
  Provider,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import Redis from 'ioredis';
import {
  RATE_LIMIT_OPTIONS,
  RATE_LIMIT_POLICIES,
  RATE_LIMIT_REDIS,
  RATE_LIMIT_STORAGE,
  SYSTEM_LOAD_PROVIDER,
  USER_PLAN_PROVIDER,
} from './constants/rate-limit.constants';
import { DynamicRateLimitGuard } from './guards/dynamic-rate-limit.guard';
import { PublicApiController } from './examples/public-api.controller';
import { ReportsController } from './examples/reports.controller';
import type { RateLimitPolicy } from './interfaces/rate-limit-policy.interface';
import type {
  NormalizedRateLimitModuleOptions,
  RateLimitModuleOptions,
  TimeRateLimitRule,
} from './interfaces/rate-limit-rule.interface';
import { ApiPriorityRateLimitPolicy } from './policies/api-priority-rate-limit.policy';
import { SystemLoadRateLimitPolicy } from './policies/system-load-rate-limit.policy';
import { TimeRateLimitPolicy } from './policies/time-rate-limit.policy';
import { UserRateLimitPolicy } from './policies/user-rate-limit.policy';
import { DefaultSystemLoadProvider } from './providers/default-system-load.provider';
import { RequestUserPlanProvider } from './providers/request-user-plan.provider';
import { RateLimitPolicyEngine } from './services/rate-limit-policy-engine.service';
import { RateLimitRuleService } from './services/rate-limit-rule.service';
import { RateLimitService } from './services/rate-limit.service';
import { RedisFixedWindowStorage } from './storage/redis-fixed-window.storage';

export interface RateLimitModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  inject?: FactoryProvider['inject'];
  useFactory: (
    ...args: never[]
  ) => RateLimitModuleOptions | Promise<RateLimitModuleOptions>;
}

const DEFAULT_TIME_RULES: TimeRateLimitRule[] = [
  { name: 'night', start: '00:00', end: '06:00', multiplier: 1.5 },
  { name: 'morning-normal', start: '06:00', end: '09:00', multiplier: 1 },
  { name: 'morning-peak', start: '09:00', end: '11:00', multiplier: 0.6 },
  { name: 'lunch-peak', start: '11:00', end: '14:00', multiplier: 0.4 },
  { name: 'afternoon', start: '14:00', end: '17:00', multiplier: 0.8 },
  { name: 'evening-peak', start: '17:00', end: '22:00', multiplier: 0.5 },
  { name: 'late-evening', start: '22:00', end: '00:00', multiplier: 1.2 },
];

@Module({ controllers: [ReportsController, PublicApiController] })
export class RateLimitModule {
  static forRoot(options: RateLimitModuleOptions = {}): DynamicModule {
    const normalized = this.normalize(options);
    return {
      module: RateLimitModule,
      global: true,
      providers: [
        { provide: RATE_LIMIT_OPTIONS, useValue: normalized },
        ...this.providers(),
        ...(normalized.registerGlobalGuard
          ? [{ provide: APP_GUARD, useClass: DynamicRateLimitGuard }]
          : []),
      ],
      exports: [RateLimitService, RateLimitPolicyEngine, RATE_LIMIT_STORAGE],
    };
  }

  static forRootAsync(options: RateLimitModuleAsyncOptions): DynamicModule {
    return {
      module: RateLimitModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: RATE_LIMIT_OPTIONS,
          inject: options.inject ?? [],
          useFactory: async (...args: never[]) =>
            this.normalize(await options.useFactory(...args)),
        },
        ...this.providers(),
        { provide: APP_GUARD, useClass: DynamicRateLimitGuard },
      ],
      exports: [RateLimitService, RateLimitPolicyEngine, RATE_LIMIT_STORAGE],
    };
  }

  private static providers(): Provider[] {
    return [
      TimeRateLimitPolicy,
      UserRateLimitPolicy,
      SystemLoadRateLimitPolicy,
      ApiPriorityRateLimitPolicy,
      DefaultSystemLoadProvider,
      RequestUserPlanProvider,
      { provide: SYSTEM_LOAD_PROVIDER, useExisting: DefaultSystemLoadProvider },
      { provide: USER_PLAN_PROVIDER, useExisting: RequestUserPlanProvider },
      {
        provide: RATE_LIMIT_POLICIES,
        inject: [
          RATE_LIMIT_OPTIONS,
          TimeRateLimitPolicy,
          UserRateLimitPolicy,
          SystemLoadRateLimitPolicy,
          ApiPriorityRateLimitPolicy,
        ],
        useFactory: (
          options: NormalizedRateLimitModuleOptions,
          time: TimeRateLimitPolicy,
          user: UserRateLimitPolicy,
          load: SystemLoadRateLimitPolicy,
          priority: ApiPriorityRateLimitPolicy,
        ): RateLimitPolicy[] => [
          time,
          ...(options.enableUserPolicy ? [user] : []),
          load,
          priority,
        ],
      },
      {
        provide: RATE_LIMIT_REDIS,
        inject: [RATE_LIMIT_OPTIONS],
        useFactory: (options: NormalizedRateLimitModuleOptions) =>
          new Redis({
            host: options.redis.host,
            port: options.redis.port,
            password: options.redis.password,
            db: options.redis.db,
            keyPrefix: options.redis.keyPrefix,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
          }),
      },
      RedisFixedWindowStorage,
      { provide: RATE_LIMIT_STORAGE, useExisting: RedisFixedWindowStorage },
      RateLimitPolicyEngine,
      RateLimitRuleService,
      RateLimitService,
      DynamicRateLimitGuard,
    ];
  }

  private static normalize(
    options: RateLimitModuleOptions,
  ): NormalizedRateLimitModuleOptions {
    const normalized: NormalizedRateLimitModuleOptions = {
      timezone: options.timezone ?? 'Asia/Ho_Chi_Minh',
      failureMode: options.failureMode ?? 'fail-open',
      systemLoadTimeoutMs: options.systemLoadTimeoutMs ?? 200,
      systemLoadCacheTtlMs: options.systemLoadCacheTtlMs ?? 5_000,
      systemLoadFallbackMultiplier: options.systemLoadFallbackMultiplier ?? 1,
      debug: options.debug ?? false,
      redis: {
        host: options.redis?.host ?? 'localhost',
        port: options.redis?.port ?? 6379,
        password: options.redis?.password,
        db: options.redis?.db ?? 0,
        keyPrefix: options.redis?.keyPrefix ?? '',
      },
      timeRules: options.timeRules ?? DEFAULT_TIME_RULES,
      registerGlobalGuard: options.registerGlobalGuard ?? true,
      enableUserPolicy: options.enableUserPolicy ?? false,
    };
    this.validate(normalized);
    return normalized;
  }

  private static validate(options: NormalizedRateLimitModuleOptions): void {
    try {
      new Intl.DateTimeFormat('en', { timeZone: options.timezone }).format();
    } catch {
      throw new Error(`Invalid rate-limit timezone: ${options.timezone}`);
    }
    if (!['fail-open', 'fail-closed'].includes(options.failureMode))
      throw new Error(
        `Invalid rate-limit failure mode: ${options.failureMode}`,
      );
    if (options.systemLoadTimeoutMs <= 0 || options.systemLoadCacheTtlMs < 0)
      throw new Error('Rate-limit timeout/cache TTL values are invalid');
    if (
      !Number.isFinite(options.systemLoadFallbackMultiplier) ||
      options.systemLoadFallbackMultiplier <= 0
    )
      throw new Error('Invalid system-load fallback multiplier');
    for (const rule of options.timeRules) {
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.end) ||
        !Number.isFinite(rule.multiplier) ||
        rule.multiplier <= 0
      )
        throw new Error(`Invalid time rate-limit rule: ${rule.name}`);
    }
  }
}
