import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../admin/auth/auth.module';
import { Admin } from '../user/admin.entity';
import { AuditLogController } from './audit-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Admin]), AdminAuthModule],
  controllers: [AuditLogController],
})
export class AuditLogAdminModule {}
