import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Admin } from '../../user/admin.entity';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

interface AdminRequest extends Request {
  admin?: Admin;
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const admin = request.admin;

    if (!admin) {
      throw new ForbiddenException('Admin access required');
    }

    if (admin.is_super_admin) {
      return true;
    }

    const grantedPermissions = new Set(
      (admin.adminRoles ?? [])
        .filter((adminRole) => adminRole.is_active)
        .flatMap((adminRole) => adminRole.role.permissions ?? [])
        .map((rolePermission) => rolePermission.permission.name),
    );

    const hasEveryPermission = requiredPermissions.every((permission) =>
      grantedPermissions.has(permission),
    );

    if (!hasEveryPermission) {
      throw new ForbiddenException('Insufficient permission');
    }

    return true;
  }
}
