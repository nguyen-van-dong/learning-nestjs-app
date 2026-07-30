import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable, from } from 'rxjs';
import { concatMap, map } from 'rxjs/operators';
import {
  AUDIT_ACTION_KEY,
  AUDIT_LOG_OPTIONS,
  SKIP_AUDIT_KEY,
} from './audit-log.constants';
import { AuditContextService } from './audit-context.service';
import type {
  AuditActorType,
  AuditLogModuleOptions,
  AuditRequestStore,
} from './audit-log.interfaces';
import { AuditLogService } from './audit-log.service';

interface AuditedRequest extends Request {
  user?: { id?: string | number; sub?: string | number };
  admin?: { id?: string | number };
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: AuditContextService,
    private readonly auditLogService: AuditLogService,
    @Inject(AUDIT_LOG_OPTIONS)
    private readonly options: AuditLogModuleOptions,
  ) {}

  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (
      executionContext.getType() !== 'http' ||
      this.options.enabled === false ||
      this.isSkipped(executionContext)
    ) {
      return next.handle();
    }

    const http = executionContext.switchToHttp();
    const request = http.getRequest<AuditedRequest>();
    const response = http.getResponse<Response>();
    const method = request.method.toUpperCase();
    const route = this.getRoute(request);
    const includedMethods = this.options.includeMethods ?? [
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
    ];

    if (
      !includedMethods.includes(method) ||
      (this.options.excludedRoutes ?? []).some((excluded) => excluded === route)
    ) {
      return next.handle();
    }

    const actor = this.resolveActor(request);
    const store: AuditRequestStore = {
      requestId: this.getRequestId(request),
      actorType: actor.type,
      actorId: actor.id,
      method,
      route,
      ipAddress: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
      startedAt: Date.now(),
      action: this.reflector.getAllAndOverride<string>(AUDIT_ACTION_KEY, [
        executionContext.getHandler(),
        executionContext.getClass(),
      ]),
      mutations: [],
    };

    return new Observable((subscriber) =>
      this.context.run(store, () =>
        next
          .handle()
          .pipe(
            concatMap((value: unknown) =>
              from(
                this.auditLogService.persistRequest(
                  store,
                  response.statusCode,
                  Date.now() - store.startedAt,
                ),
              ).pipe(map(() => value)),
            ),
          )
          .subscribe(subscriber),
      ),
    );
  }

  private isSkipped(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private resolveActor(request: AuditedRequest): {
    type: AuditActorType;
    id: string | number | null;
  } {
    if (request.admin?.id !== undefined) {
      return { type: 'admin', id: request.admin.id };
    }
    const userId = request.user?.id ?? request.user?.sub;
    if (userId !== undefined) {
      return { type: 'user', id: userId };
    }
    return { type: 'anonymous', id: null };
  }

  private getRoute(request: Request): string {
    return request.originalUrl.split('?')[0];
  }

  private getRequestId(request: Request): string {
    const requestId = request.get('x-request-id');
    return requestId && this.isUuid(requestId) ? requestId : randomUUID();
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
