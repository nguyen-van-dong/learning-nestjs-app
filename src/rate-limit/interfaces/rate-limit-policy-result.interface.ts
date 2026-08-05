export type RateLimitPolicyResult =
  | {
      applied: true;
      multiplier: number;
      reason: string;
      metadata?: Record<string, unknown>;
    }
  | {
      applied: false;
      reason: string;
      metadata?: Record<string, unknown>;
    };

export interface ResolvedRateLimit {
  baseLimit: number;
  finalLimit: number;
  ttlSeconds: number;
  appliedPolicies: Array<{
    name: string;
    applied: boolean;
    multiplier: number;
    reason: string;
    metadata?: Record<string, unknown>;
  }>;
}
