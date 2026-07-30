import { ModuleMetadata, Type } from '@nestjs/common';

export type AuditActorType = 'user' | 'admin' | 'anonymous' | 'system';
export type AuditAction = string;
export type AuditFailureMode = 'non-blocking' | 'strict';

export interface AuditLogModuleOptions {
  enabled?: boolean;
  includeMethods?: string[];
  excludedRoutes?: string[];
  sensitiveFields?: string[];
  failureMode?: AuditFailureMode;
}

export interface AuditLogOptionsFactory {
  createAuditLogOptions():
    Promise<AuditLogModuleOptions> | AuditLogModuleOptions;
}

export interface AuditLogModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  inject?: any[];
  useFactory?: (
    ...args: any[]
  ) => Promise<AuditLogModuleOptions> | AuditLogModuleOptions;
  useClass?: Type<AuditLogOptionsFactory>;
}

export interface AuditMutation {
  action: AuditAction;
  entityType: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
}

export interface AuditRequestStore {
  requestId: string;
  actorType: AuditActorType;
  actorId: string | number | null;
  method: string;
  route: string;
  ipAddress: string | null;
  userAgent: string | null;
  startedAt: number;
  action?: string;
  mutations: AuditMutation[];
}
