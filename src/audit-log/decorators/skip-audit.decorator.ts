import { SetMetadata } from '@nestjs/common';
import { SKIP_AUDIT_KEY } from '../audit-log.constants';

export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
