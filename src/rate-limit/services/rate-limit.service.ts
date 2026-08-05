import { Inject, Injectable } from '@nestjs/common';
import { RATE_LIMIT_STORAGE } from '../constants/rate-limit.constants';
import type { RateLimitContext } from '../interfaces/rate-limit-context.interface';
import type { RateLimitStorage } from '../interfaces/rate-limit-storage.interface';
import { RateLimitPolicyEngine } from './rate-limit-policy-engine.service';
import { RateLimitRuleService } from './rate-limit-rule.service';

@Injectable()
export class RateLimitService {
  constructor(
    private readonly engine: RateLimitPolicyEngine,
    private readonly rules: RateLimitRuleService,
    @Inject(RATE_LIMIT_STORAGE) private readonly storage: RateLimitStorage,
  ) {}

  async consume(context: RateLimitContext) {
    const resolved = await this.engine.resolve(context);
    const identity = this.rules.buildStorageKey(context);
    const result = await this.storage.consume({
      key: identity.key,
      limit: resolved.finalLimit,
      ttlSeconds: resolved.ttlSeconds,
    });
    return { resolved, result, identity: identity.identity };
  }
}
