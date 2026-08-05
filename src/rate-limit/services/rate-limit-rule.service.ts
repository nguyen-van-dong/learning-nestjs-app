import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { RateLimitContext } from '../interfaces/rate-limit-context.interface';

@Injectable()
export class RateLimitRuleService {
  buildStorageKey(context: RateLimitContext): {
    key: string;
    identity: string;
  } {
    const identity = this.resolveIdentity(context);
    const safeIdentity = this.hash(identity);
    return {
      key: `rate-limit:${this.sanitizeRouteKey(context.routeKey)}:${safeIdentity}`,
      identity,
    };
  }

  private resolveIdentity(context: RateLimitContext): string {
    if (context.tenantId && context.userId)
      return `tenant-user:${context.tenantId}:${context.userId}`;
    if (context.userId) return `user:${context.userId}`;
    if (context.apiKey) return `api-key:${context.apiKey}`;
    return `ip:${context.ip || 'unknown'}`;
  }

  private hash(identity: string): string {
    const kind = identity.slice(0, identity.indexOf(':')) || 'identity';
    return `${kind}:${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
  }

  private sanitizeRouteKey(routeKey: string): string {
    return routeKey.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  }
}
