import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/auth.module';
import { AdminUserModule } from './user/user.module';

@Module({
  imports: [AdminAuthModule, AdminUserModule],
})
export class AdminModule {}
