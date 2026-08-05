import type { Request } from 'express';
import type { RateLimitPriority } from './rate-limit-rule.interface';

export interface RateLimitRequestUser {
  id?: string | number;
  sub?: string | number;
  tenantId?: string | number;
  tenant_id?: string | number;
  subscriptionPlan?: string;
  subscription_plan?: string;
}

export interface RateLimitContext {
  routeKey: string;
  baseLimit: number;
  ttlSeconds: number;
  priority: RateLimitPriority;
  now: Date;
  userId?: string;
  tenantId?: string;
  subscriptionPlan?: string;
  apiKey?: string;
  ip: string;
  method: string;
  path: string;
  request: Request;
}
