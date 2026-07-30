import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/auth.module';
import { AdminUserModule } from './user/user.module';
import { AuditLogAdminModule } from '../audit-log/audit-log-admin.module';

@Module({
  imports: [AdminAuthModule, AdminUserModule, AuditLogAdminModule],
})
export class AdminModule {}
