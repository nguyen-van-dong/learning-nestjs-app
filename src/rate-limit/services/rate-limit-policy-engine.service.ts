import { Inject, Injectable, Logger } from '@nestjs/common';
import { RATE_LIMIT_POLICIES } from '../constants/rate-limit.constants';
import type { RateLimitContext } from '../interfaces/rate-limit-context.interface';
import type { RateLimitPolicy } from '../interfaces/rate-limit-policy.interface';
import type { ResolvedRateLimit } from '../interfaces/rate-limit-policy-result.interface';

@Injectable()
export class RateLimitPolicyEngine {
  private readonly logger = new Logger(RateLimitPolicyEngine.name);

  constructor(
    @Inject(RATE_LIMIT_POLICIES)
    private readonly policies: RateLimitPolicy[],
  ) {}

  async resolve(context: RateLimitContext): Promise<ResolvedRateLimit> {
    let calculatedLimit = context.baseLimit;
    const appliedPolicies: ResolvedRateLimit['appliedPolicies'] = [];

    for (const policy of [...this.policies].sort((a, b) => a.order - b.order)) {
      try {
        const result = await policy.evaluate(context);
        if (!result || typeof result.applied !== 'boolean') {
          throw new Error('Policy returned an invalid result');
        }
        const multiplier = result.applied ? result.multiplier : 1;
        if (!Number.isFinite(multiplier) || multiplier <= 0) {
          throw new Error(`Invalid multiplier: ${multiplier}`);
        }
        calculatedLimit *= multiplier;
        appliedPolicies.push({
          name: policy.name,
          applied: result.applied,
          multiplier,
          reason: result.reason,
          metadata: result.metadata,
        });
      } catch (error) {
        this.logger.warn(
          `Policy ${policy.name} failed open: ${error instanceof Error ? error.message : String(error)}`,
        );
        appliedPolicies.push({
          name: policy.name,
          applied: false,
          multiplier: 1,
          reason: 'Policy error; failed open',
        });
      }
    }

    return {
      baseLimit: context.baseLimit,
      finalLimit: Math.max(1, Math.floor(calculatedLimit)),
      ttlSeconds: context.ttlSeconds,
      appliedPolicies,
    };
  }
}
