import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../user/user.entity';
import { Admin } from '../../user/admin.entity';
import { AdminAuthModule } from '../auth/auth.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Admin]), AdminAuthModule],
  controllers: [UserController],
  providers: [UserService],
})
export class AdminUserModule {}
