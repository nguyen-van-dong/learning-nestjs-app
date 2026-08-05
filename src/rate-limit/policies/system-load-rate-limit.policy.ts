import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  RATE_LIMIT_OPTIONS,
  SYSTEM_LOAD_PROVIDER,
} from '../constants/rate-limit.constants';
import type { RateLimitContext } from '../interfaces/rate-limit-context.interface';
import type {
  RateLimitPolicy,
  SystemLoadProvider,
  SystemLoadSnapshot,
} from '../interfaces/rate-limit-policy.interface';
import type { RateLimitPolicyResult } from '../interfaces/rate-limit-policy-result.interface';
import type { NormalizedRateLimitModuleOptions } from '../interfaces/rate-limit-rule.interface';

@Injectable()
export class SystemLoadRateLimitPolicy implements RateLimitPolicy {
  readonly name = 'systemLoad';
  readonly order = 30;
  private readonly logger = new Logger(SystemLoadRateLimitPolicy.name);
  private cached?: { snapshot: SystemLoadSnapshot; expiresAt: number };

  constructor(
    @Inject(SYSTEM_LOAD_PROVIDER) private readonly provider: SystemLoadProvider,
    @Inject(RATE_LIMIT_OPTIONS)
    private readonly options: NormalizedRateLimitModuleOptions,
  ) {}

  async evaluate(context: RateLimitContext): Promise<RateLimitPolicyResult> {
    void context;
    try {
      const snapshot = await this.snapshot();
      const multipliers = this.multipliers(snapshot);
      if (multipliers.length === 0 || Math.min(...multipliers) === 1) {
        return { applied: false, reason: 'System load is normal' };
      }
      return {
        applied: true,
        multiplier: Math.min(...multipliers),
        reason: 'System load protection applied',
      };
    } catch (error) {
      this.logger.warn(
        `System load provider unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      const fallback = this.options.systemLoadFallbackMultiplier;
      return fallback === 1
        ? { applied: false, reason: 'System load fallback (fail-open)' }
        : {
            applied: true,
            multiplier: fallback,
            reason: 'System load fallback',
          };
    }
  }

  private async snapshot(): Promise<SystemLoadSnapshot> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) return this.cached.snapshot;
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('System load provider timed out')),
          this.options.systemLoadTimeoutMs,
        );
      });
      const snapshot = await Promise.race([
        this.provider.getSnapshot(),
        timeout,
      ]);
      this.cached = {
        snapshot,
        expiresAt: now + this.options.systemLoadCacheTtlMs,
      };
      return snapshot;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private multipliers(snapshot: SystemLoadSnapshot): number[] {
    const values: number[] = [];
    const cpu = snapshot.cpuUsagePercent;
    if (cpu !== undefined)
      values.push(cpu > 90 ? 0.2 : cpu >= 80 ? 0.5 : cpu >= 60 ? 0.8 : 1);
    if ((snapshot.databasePoolUsagePercent ?? 0) > 90) values.push(0.4);
    if ((snapshot.queueWaitingJobs ?? 0) > 10_000) values.push(0.3);
    if ((snapshot.averageLatencyMs ?? 0) > 2_000) values.push(0.3);
    return values;
  }
}
