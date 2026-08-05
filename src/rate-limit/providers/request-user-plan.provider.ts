import { Injectable } from '@nestjs/common';
import type { RateLimitContext } from '../interfaces/rate-limit-context.interface';
import type { UserPlanProvider } from '../interfaces/rate-limit-policy.interface';

@Injectable()
export class RequestUserPlanProvider implements UserPlanProvider {
  getPlan(context: RateLimitContext): Promise<string | undefined> {
    // TODO: add a cached user-plan adapter if plans are not embedded in JWT/user.
    return Promise.resolve(context.subscriptionPlan);
  }
}
