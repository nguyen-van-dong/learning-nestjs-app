import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_LOG_OPTIONS,
  DEFAULT_AUDIT_SENSITIVE_FIELDS,
} from './audit-log.constants';
import type { AuditLogModuleOptions } from './audit-log.interfaces';

@Injectable()
export class AuditSanitizerService {
  private readonly sensitiveFields: Set<string>;

  constructor(
    @Inject(AUDIT_LOG_OPTIONS)
    options: AuditLogModuleOptions,
  ) {
    this.sensitiveFields = new Set(
      [
        ...DEFAULT_AUDIT_SENSITIVE_FIELDS,
        ...(options.sensitiveFields ?? []),
      ].map((field) => this.normalizeKey(field)),
    );
  }

  sanitize(value: unknown): unknown {
    return this.visit(value, new WeakSet<object>());
  }

  private visit(value: unknown, seen: WeakSet<object>): unknown {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value ?? null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value !== 'object') {
      return null;
    }

    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => this.visit(item, seen));
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        this.sensitiveFields.has(this.normalizeKey(key))
          ? '[REDACTED]'
          : this.visit(item, seen),
      ]),
    );
  }

  private normalizeKey(key: string): string {
    return key.replace(/[-_]/g, '').toLowerCase();
  }
}
