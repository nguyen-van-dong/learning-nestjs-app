import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { EmailVerificationToken } from './email-verification-tokens.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, EmailVerificationToken])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
