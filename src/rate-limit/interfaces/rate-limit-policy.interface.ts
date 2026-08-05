import type { RateLimitContext } from './rate-limit-context.interface';
import type { RateLimitPolicyResult } from './rate-limit-policy-result.interface';

export interface RateLimitPolicy {
  readonly name: string;
  readonly order: number;
  evaluate(context: RateLimitContext): Promise<RateLimitPolicyResult>;
}

export interface SystemLoadSnapshot {
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
  databasePoolUsagePercent?: number;
  queueWaitingJobs?: number;
  averageLatencyMs?: number;
  measuredAt: Date;
}

export interface SystemLoadProvider {
  getSnapshot(): Promise<SystemLoadSnapshot>;
}

export interface UserPlanProvider {
  getPlan(context: RateLimitContext): Promise<string | undefined>;
}
