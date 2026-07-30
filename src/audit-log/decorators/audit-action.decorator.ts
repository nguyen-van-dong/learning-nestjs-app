import { SetMetadata } from '@nestjs/common';
import { AUDIT_ACTION_KEY } from '../audit-log.constants';

export const AuditAction = (action: string) =>
  SetMetadata(AUDIT_ACTION_KEY, action);
