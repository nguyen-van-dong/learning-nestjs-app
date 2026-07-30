import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AuditMutation, AuditRequestStore } from './audit-log.interfaces';

@Injectable()
export class AuditContextService {
  private readonly storage = new AsyncLocalStorage<AuditRequestStore>();

  run<T>(store: AuditRequestStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  getStore(): AuditRequestStore | undefined {
    return this.storage.getStore();
  }

  addMutation(mutation: AuditMutation): void {
    this.storage.getStore()?.mutations.push(mutation);
  }
}
