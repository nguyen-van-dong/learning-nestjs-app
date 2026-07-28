import { Body, Controller, Post } from '@nestjs/common';
import { AdminAuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  login(@Body() credentials: AdminLoginDto) {
    return this.adminAuthService.login(credentials);
  }
}
