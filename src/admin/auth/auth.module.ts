import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from '../../user/admin.entity';
import { AdminRole } from '../../user/admin-role.entity';
import { Permission } from '../../user/permission.entity';
import { RolePermission } from '../../user/role-permission.entity';
import { Role } from '../../user/role.entity';
import { AdminAuthController } from './auth.controller';
import { AdminAuthService } from './auth.service';
import { AdminAuthGuard } from '../guard/admin-auth.guard';
import { PermissionGuard } from '../guard/permission.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Admin,
      AdminRole,
      Role,
      RolePermission,
      Permission,
    ]),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminAuthGuard, PermissionGuard],
  exports: [TypeOrmModule, AdminAuthGuard, PermissionGuard],
})
export class AdminAuthModule {}
