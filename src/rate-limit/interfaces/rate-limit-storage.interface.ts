export interface RateLimitStorageResult {
  allowed: boolean;
  current: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: Date;
}

export interface RateLimitStorage {
  consume(input: {
    key: string;
    limit: number;
    ttlSeconds: number;
  }): Promise<RateLimitStorageResult>;
}
