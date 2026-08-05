import { Injectable } from '@nestjs/common';
import type {
  SystemLoadProvider,
  SystemLoadSnapshot,
} from '../interfaces/rate-limit-policy.interface';

@Injectable()
export class DefaultSystemLoadProvider implements SystemLoadProvider {
  getSnapshot(): Promise<SystemLoadSnapshot> {
    // Replace this provider with an application metrics adapter when available.
    return Promise.resolve({ measuredAt: new Date() });
  }
}
