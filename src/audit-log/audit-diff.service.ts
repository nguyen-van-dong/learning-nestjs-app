import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditDiffService {
  diff(
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!before || !after) {
      return null;
    }

    const changes: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of keys) {
      if (!this.isEqual(before[key], after[key])) {
        changes[key] = {
          before: before[key] ?? null,
          after: after[key] ?? null,
        };
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  private isEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
}
