import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  RATE_LIMIT_METADATA,
  RATE_LIMIT_OPTIONS,
} from '../constants/rate-limit.constants';
import type {
  RateLimitContext,
  RateLimitRequestUser,
} from '../interfaces/rate-limit-context.interface';
import type {
  DynamicRateLimitOptions,
  NormalizedRateLimitModuleOptions,
} from '../interfaces/rate-limit-rule.interface';
import { RateLimitService } from '../services/rate-limit.service';

type RateLimitRequest = Request & {
  user?: RateLimitRequestUser;
  tenant?: { id?: string | number };
};

@Injectable()
export class DynamicRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(DynamicRateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly service: RateLimitService,
    @Inject(RATE_LIMIT_OPTIONS)
    private readonly moduleOptions: NormalizedRateLimitModuleOptions,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<DynamicRateLimitOptions>(
      RATE_LIMIT_METADATA,
      [executionContext.getHandler(), executionContext.getClass()],
    );
    if (!options || options.enabled === false) return true;
    this.validateDecoratorOptions(options);

    const http = executionContext.switchToHttp();
    const request = http.getRequest<RateLimitRequest>();
    const response = http.getResponse<Response>();
    const context = this.buildContext(request, options);

    try {
      const consumed = await this.service.consume(context);
      response.setHeader('X-RateLimit-Limit', consumed.resolved.finalLimit);
      response.setHeader('X-RateLimit-Remaining', consumed.result.remaining);
      response.setHeader(
        'X-RateLimit-Reset',
        Math.ceil(consumed.result.resetAt.getTime() / 1000),
      );

      if (this.moduleOptions.debug) {
        const policySummary = consumed.resolved.appliedPolicies
          .map((policy) => `${policy.name}=${policy.multiplier}`)
          .join(' ');
        this.logger.debug(
          `Rate limit resolved: route=${context.routeKey} identity=${this.safeIdentity(consumed.identity)} baseLimit=${context.baseLimit} finalLimit=${consumed.resolved.finalLimit} ${policySummary}`,
        );
      }

      if (!consumed.result.allowed) {
        response.setHeader('Retry-After', consumed.result.retryAfterSeconds);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests',
            error: 'Too Many Requests',
            rateLimit: {
              limit: consumed.resolved.finalLimit,
              remaining: 0,
              retryAfterSeconds: consumed.result.retryAfterSeconds,
              resetAt: consumed.result.resetAt.toISOString(),
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429)
        throw error;
      this.logger.error(
        `Rate limit storage failed for route=${context.routeKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (this.moduleOptions.failureMode === 'fail-open') return true;
      throw new ServiceUnavailableException(
        'Rate limiting service unavailable',
      );
    }
  }

  private buildContext(
    request: RateLimitRequest,
    options: DynamicRateLimitOptions,
  ): RateLimitContext {
    const user = request.user;
    const userId = user?.sub ?? user?.id;
    const tenantId = user?.tenantId ?? user?.tenant_id ?? request.tenant?.id;
    return {
      routeKey: options.key,
      baseLimit: options.baseLimit,
      ttlSeconds: options.ttlSeconds,
      priority: options.priority ?? 'normal',
      now: new Date(),
      userId: userId === undefined ? undefined : String(userId),
      tenantId: tenantId === undefined ? undefined : String(tenantId),
      subscriptionPlan: user?.subscriptionPlan ?? user?.subscription_plan,
      apiKey: this.singleHeader(request.headers['x-api-key']),
      ip: request.ip ?? request.socket.remoteAddress ?? 'unknown',
      method: request.method,
      path: request.path,
      request,
    };
  }

  private singleHeader(
    value: string | string[] | undefined,
  ): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  private safeIdentity(identity: string): string {
    const [kind] = identity.split(':');
    return `${kind}:redacted`;
  }

  private validateDecoratorOptions(options: DynamicRateLimitOptions): void {
    if (
      !options.key ||
      !Number.isInteger(options.baseLimit) ||
      options.baseLimit <= 0 ||
      !Number.isInteger(options.ttlSeconds) ||
      options.ttlSeconds <= 0
    ) {
      throw new Error('Invalid DynamicRateLimit decorator options');
    }
  }
}
