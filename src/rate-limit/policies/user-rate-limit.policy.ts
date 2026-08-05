import { Inject, Injectable } from '@nestjs/common';
import { USER_PLAN_PROVIDER } from '../constants/rate-limit.constants';
import type { RateLimitContext } from '../interfaces/rate-limit-context.interface';
import type {
  RateLimitPolicy,
  UserPlanProvider,
} from '../interfaces/rate-limit-policy.interface';
import type { RateLimitPolicyResult } from '../interfaces/rate-limit-policy-result.interface';

const PLAN_MULTIPLIERS: Readonly<Record<string, number>> = {
  free: 1,
  pro: 2,
  business: 5,
};

@Injectable()
export class UserRateLimitPolicy implements RateLimitPolicy {
  readonly name = 'user';
  readonly order = 20;

  constructor(
    @Inject(USER_PLAN_PROVIDER) private readonly planProvider: UserPlanProvider,
  ) {}

  async evaluate(context: RateLimitContext): Promise<RateLimitPolicyResult> {
    if (!context.userId) {
      return { applied: false, reason: 'Anonymous request' };
    }
    const plan = (await this.planProvider.getPlan(context))?.toLowerCase();
    if (!plan || !(plan in PLAN_MULTIPLIERS)) {
      return { applied: false, reason: 'No recognized subscription plan' };
    }
    const multiplier = PLAN_MULTIPLIERS[plan];
    if (multiplier === 1) {
      return { applied: false, reason: 'Free plan uses base limit' };
    }
    return {
      applied: true,
      multiplier,
      reason: `Subscription plan ${plan}`,
      metadata: { plan },
    };
  }
}
