export type RateLimitMetric =
  | 'rate_limit_allowed_total'
  | 'rate_limit_rejected_total'
  | 'rate_limit_storage_errors_total'
  | 'rate_limit_policy_errors_total';

/** Adapter boundary for Prometheus/OpenTelemetry integration without coupling core logic. */
export interface RateLimitObserver {
  increment(
    metric: RateLimitMetric,
    labels: { routeKey: string; policy?: string },
  ): void;
}
