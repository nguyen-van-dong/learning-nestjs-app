import { Injectable } from '@nestjs/common';
import type { RateLimitContext } from '../interfaces/rate-limit-context.interface';
import type { RateLimitPolicy } from '../interfaces/rate-limit-policy.interface';
import type { RateLimitPolicyResult } from '../interfaces/rate-limit-policy-result.interface';
import type { RateLimitPriority } from '../interfaces/rate-limit-rule.interface';

const MULTIPLIERS: Record<RateLimitPriority, number> = {
  critical: 1.5,
  high: 1.2,
  normal: 1,
  low: 0.5,
};

@Injectable()
export class ApiPriorityRateLimitPolicy implements RateLimitPolicy {
  readonly name = 'apiPriority';
  readonly order = 40;

  evaluate(context: RateLimitContext): Promise<RateLimitPolicyResult> {
    if (context.priority === 'normal') {
      return Promise.resolve({
        applied: false,
        reason: 'Normal priority uses base limit',
      });
    }
    return Promise.resolve({
      applied: true,
      multiplier: MULTIPLIERS[context.priority],
      reason: `${context.priority} API priority`,
    });
  }
}
