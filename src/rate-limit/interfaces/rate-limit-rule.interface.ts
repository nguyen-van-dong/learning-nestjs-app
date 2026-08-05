export type RateLimitPriority = 'critical' | 'high' | 'normal' | 'low';
export type RateLimitFailureMode = 'fail-open' | 'fail-closed';

export interface DynamicRateLimitOptions {
  key: string;
  baseLimit: number;
  ttlSeconds: number;
  priority?: RateLimitPriority;
  enabled?: boolean;
}

export interface TimeRateLimitRule {
  name: string;
  start: string;
  end: string;
  multiplier: number;
}

export interface RateLimitModuleOptions {
  timezone?: string;
  failureMode?: RateLimitFailureMode;
  systemLoadTimeoutMs?: number;
  systemLoadCacheTtlMs?: number;
  systemLoadFallbackMultiplier?: number;
  debug?: boolean;
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  timeRules?: TimeRateLimitRule[];
  registerGlobalGuard?: boolean;
  enableUserPolicy?: boolean;
}

export interface NormalizedRateLimitModuleOptions {
  timezone: string;
  failureMode: RateLimitFailureMode;
  systemLoadTimeoutMs: number;
  systemLoadCacheTtlMs: number;
  systemLoadFallbackMultiplier: number;
  debug: boolean;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
  };
  timeRules: TimeRateLimitRule[];
  registerGlobalGuard: boolean;
  enableUserPolicy: boolean;
}
