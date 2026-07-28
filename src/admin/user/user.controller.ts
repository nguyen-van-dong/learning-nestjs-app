import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { AdminAuthGuard } from '../guard/admin-auth.guard';
import { PermissionGuard } from '../guard/permission.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';

@Controller('admin/users')
@UseGuards(AdminAuthGuard, PermissionGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermissions('user.read')
  getUsers() {
    return this.userService.getUsers();
  }
}
