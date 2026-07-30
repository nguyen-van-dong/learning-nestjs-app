import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { AuditContextService } from './audit-context.service';
import { AuditDiffService } from './audit-diff.service';
import { AuditLog } from './audit-log.entity';
import { AUDIT_LOG_OPTIONS } from './audit-log.constants';
import type {
  AuditLogModuleOptions,
  AuditMutation,
  AuditRequestStore,
} from './audit-log.interfaces';
import { AuditSanitizerService } from './audit-sanitizer.service';

export interface AuditLogQuery {
  actorType?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  requestId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly context: AuditContextService,
    private readonly sanitizer: AuditSanitizerService,
    private readonly diffService: AuditDiffService,
    @Inject(AUDIT_LOG_OPTIONS)
    private readonly options: AuditLogModuleOptions,
  ) {}

  record(mutation: AuditMutation): void {
    if (this.options.enabled === false) {
      return;
    }
    this.context.addMutation(mutation);
  }

  recordCreate(entityType: string, after: unknown, entityId?: string | number) {
    this.record({
      action: 'CREATE',
      entityType,
      entityId: entityId ?? this.extractId(after),
      before: null,
      after,
    });
  }

  recordUpdate(
    entityType: string,
    before: unknown,
    after: unknown,
    entityId?: string | number,
  ) {
    this.record({
      action: 'UPDATE',
      entityType,
      entityId: entityId ?? this.extractId(after) ?? this.extractId(before),
      before,
      after,
    });
  }

  recordDelete(
    entityType: string,
    before: unknown,
    entityId?: string | number,
  ) {
    this.record({
      action: 'DELETE',
      entityType,
      entityId: entityId ?? this.extractId(before),
      before,
      after: null,
    });
  }

  async persistRequest(
    store: AuditRequestStore,
    statusCode: number,
    durationMs: number,
  ): Promise<void> {
    if (this.options.enabled === false || store.mutations.length === 0) {
      return;
    }

    const logs = store.mutations.map((mutation) => {
      const before = this.asObject(this.sanitizer.sanitize(mutation.before));
      const after = this.asObject(this.sanitizer.sanitize(mutation.after));

      return this.auditLogRepository.create({
        requestId: store.requestId,
        actorType: store.actorType,
        actorId: store.actorId === null ? null : String(store.actorId),
        action: store.action ?? mutation.action,
        method: store.method,
        route: store.route,
        entityType: mutation.entityType,
        entityId:
          mutation.entityId === null || mutation.entityId === undefined
            ? null
            : String(mutation.entityId),
        beforeData: before,
        afterData: after,
        changes: this.diffService.diff(before, after),
        statusCode,
        durationMs,
        ipAddress: store.ipAddress,
        userAgent: store.userAgent,
      });
    });

    try {
      await this.auditLogRepository.save(logs);
    } catch (error) {
      this.logger.error(
        `Could not persist audit logs for request ${store.requestId}`,
        error instanceof Error ? error.stack : String(error),
      );
      if (this.options.failureMode === 'strict') {
        throw error;
      }
    }
  }

  async findAll(query: AuditLogQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const where: FindOptionsWhere<AuditLog> = {};

    if (query.actorType) where.actorType = query.actorType;
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.requestId) where.requestId = query.requestId;

    const [data, total] = await this.auditLogRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  findOne(id: string) {
    return this.auditLogRepository.findOneBy({ id });
  }

  private extractId(value: unknown): string | number | undefined {
    if (value && typeof value === 'object' && 'id' in value) {
      const id = (value as { id?: unknown }).id;
      if (typeof id === 'string' || typeof id === 'number') {
        return id;
      }
    }
    return undefined;
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return { value };
  }
}
