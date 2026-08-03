import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from 'src/user/user.entity';
import { EmailVerificationToken } from 'src/user/email-verification-tokens.entity';
import { UserRegisteredListener } from './listeners/user-registered.listener';
import { MailModule } from 'src/mail/mail.module';
import { PasswordResetToken } from 'src/user/password-reset-token.entity';
import { PasswordResetRequestedListener } from './listeners/password-reset-requested.listener';
import { AuthSession } from './auth-session.entity';
import { RefreshToken } from './refresh-token.entity';
import { AuthGuard } from 'src/guards/auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      EmailVerificationToken,
      PasswordResetToken,
      AuthSession,
      RefreshToken,
    ]),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>(
            'JWT_EXPIRES_IN',
            '1d',
          ) as StringValue,
        },
      }),
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserRegisteredListener,
    PasswordResetRequestedListener,
    AuthGuard,
  ],
  exports: [TypeOrmModule, AuthGuard],
})
export class AuthModule {}
