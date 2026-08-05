import { Inject, Injectable } from '@nestjs/common';
import { RATE_LIMIT_OPTIONS } from '../constants/rate-limit.constants';
import type { RateLimitContext } from '../interfaces/rate-limit-context.interface';
import type { RateLimitPolicy } from '../interfaces/rate-limit-policy.interface';
import type { RateLimitPolicyResult } from '../interfaces/rate-limit-policy-result.interface';
import type {
  NormalizedRateLimitModuleOptions,
  TimeRateLimitRule,
} from '../interfaces/rate-limit-rule.interface';

@Injectable()
export class TimeRateLimitPolicy implements RateLimitPolicy {
  readonly name = 'time';
  readonly order = 10;

  constructor(
    @Inject(RATE_LIMIT_OPTIONS)
    private readonly options: NormalizedRateLimitModuleOptions,
  ) {}

  evaluate(context: RateLimitContext): Promise<RateLimitPolicyResult> {
    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.options.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(context.now);
    const minute = this.toMinuteOfDay(localTime);
    const rule = this.options.timeRules.find((candidate) =>
      this.isInRange(minute, candidate),
    );

    return Promise.resolve(
      rule
        ? {
            applied: true,
            multiplier: rule.multiplier,
            reason: `Matched time rule ${rule.name}`,
            metadata: {
              rule: rule.name,
              localTime,
              timezone: this.options.timezone,
            },
          }
        : { applied: false, reason: 'No matching time rule' },
    );
  }

  private isInRange(minute: number, rule: TimeRateLimitRule): boolean {
    const start = this.toMinuteOfDay(rule.start);
    const end = this.toMinuteOfDay(rule.end);
    if (start === end) return true;
    return start < end
      ? minute >= start && minute < end
      : minute >= start || minute < end;
  }

  private toMinuteOfDay(value: string): number {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new Error(`Invalid time value: ${value}`);
    return Number(match[1]) * 60 + Number(match[2]);
  }
}
