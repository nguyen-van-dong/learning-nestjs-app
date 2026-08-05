import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_METADATA } from '../constants/rate-limit.constants';
import type { DynamicRateLimitOptions } from '../interfaces/rate-limit-rule.interface';

export const DynamicRateLimit = (options: DynamicRateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA, options);
