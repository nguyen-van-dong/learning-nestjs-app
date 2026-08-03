import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginDTO, RegisterDTO, ResetPasswordDTO } from './auth.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/user.entity';
import { DataSource, IsNull, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { EmailVerificationToken } from 'src/user/email-verification-tokens.entity';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserRegisteredEvent } from './events/user-registered.event';
import { APP_EVENTS } from 'src/common/constants/event.constants';
import { PasswordResetToken } from 'src/user/password-reset-token.entity';
import { PasswordResetRequestedEvent } from './events/password-reset-requested.event';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { AuthSession } from './auth-session.entity';
import { RefreshToken } from './refresh-token.entity';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

interface RequestMetadata {
  ip_address: string | null;
  user_agent: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EmailVerificationToken)
    private readonly emailVerificationRepository: Repository<EmailVerificationToken>,
    private jwtService: JwtService,
    private eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    private readonly auditLogService: AuditLogService,
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly configService: ConfigService,
  ) {}

  async register(userDto: RegisterDTO) {
    const existingUser = await this.userRepository.findOne({
      where: {
        email: userDto.email,
      },
    });
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }
    // Hash password
    const saltOrRounds = 10;
    const hashed = await bcrypt.hash(userDto.password, saltOrRounds);
    const user = this.userRepository.create({
      name: userDto.name,
      email: userDto.email,
      password: hashed,
    }); // Create an entity
    const savedUser = await this.userRepository.save(user); // Save entity to DB
    this.auditLogService.recordCreate('User', savedUser);

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    const verificationToken = this.emailVerificationRepository.create({
      user_id: savedUser.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used_at: null,
    });
    const savedVerificationToken =
      await this.emailVerificationRepository.save(verificationToken);
    this.auditLogService.recordCreate(
      'EmailVerificationToken',
      savedVerificationToken,
    );

    // dispatch event to send email
    await this.eventEmitter.emitAsync(
      APP_EVENTS.USER_REGISTERED,
      new UserRegisteredEvent(
        savedUser.id,
        savedUser.name,
        savedUser.email,
        rawToken,
        savedVerificationToken.id,
      ),
    );

    return {
      data: savedUser,
      message: 'Register account successfully, please verify it.',
    };
  }

  async verifyAccount(token: string) {
    if (!token) {
      throw new BadRequestException('Token must not be empty');
    }
    const tokenHash = this.hashToken(token);
    const verificationToken = await this.emailVerificationRepository.findOne({
      where: {
        token_hash: tokenHash,
      },
      relations: {
        user: true,
      },
    });

    if (!verificationToken) {
      throw new BadRequestException('Token invalid');
    }

    if (verificationToken.used_at) {
      throw new BadRequestException('Token already verified');
    }

    if (verificationToken.expires_at.getTime() <= Date.now()) {
      throw new BadRequestException('Token expired');
    }

    const user = verificationToken.user;

    if (!user) {
      throw new BadRequestException('Account not found');
    }

    if (user.email_verified_at) {
      throw new BadRequestException('Account already verifed');
    }

    const verifiedAt = new Date();
    const userBefore = { ...user };
    const verificationTokenBefore = { ...verificationToken };

    user.email_verified_at = verifiedAt;
    user.is_active = true;

    verificationToken.used_at = verifiedAt;

    await this.userRepository.save(user);
    this.auditLogService.recordUpdate('User', userBefore, user);

    await this.emailVerificationRepository.save(verificationToken);
    this.auditLogService.recordUpdate(
      'EmailVerificationToken',
      verificationTokenBefore,
      verificationToken,
    );
    return {
      data: user,
      message: 'Verify account successfully',
    };
  }

  async login(userDto: LoginDTO, metadata: RequestMetadata) {
    const user = await this.userRepository.findOne({
      where: {
        email: userDto.email,
      },
    });
    if (!user) {
      throw new ForbiddenException('Invalid email or password');
    }
    if (!user.is_active) {
      throw new BadRequestException(
        'Account is not actived, please verify it.',
      );
    }

    const isMatchPassword = await bcrypt.compare(
      userDto.password,
      user.password,
    );
    if (!isMatchPassword) {
      throw new BadRequestException('Invalid email or password');
    }
    const now = new Date();
    const sessionLifetime = this.durationMs(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN', '30d'),
    );
    const session = await this.sessionRepository.save(
      this.sessionRepository.create({
        user_id: user.id,
        device_name: userDto.device_name?.trim() || null,
        user_agent: metadata.user_agent,
        ip_address: metadata.ip_address,
        expires_at: new Date(now.getTime() + sessionLifetime),
        last_used_at: now,
        revoked_at: null,
        revoke_reason: null,
      }),
    );
    const tokens = await this.issueTokenPair(user, session);
    return {
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          is_active: user.is_active,
        },
        ...tokens,
      },
      message: 'Login successfully',
    };
  }

  async refresh(rawToken: string, metadata: RequestMetadata) {
    const tokenHash = this.hashToken(rawToken);
    const result = await this.dataSource.transaction(async (manager) => {
      const token = await manager.findOne(RefreshToken, {
        where: { token_hash: tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      if (!token) return { status: 'invalid' as const };

      const session = await manager.findOne(AuthSession, {
        where: { id: token.session_id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) return { status: 'invalid' as const };

      const now = new Date();
      if (token.consumed_at || token.revoked_at) {
        session.revoked_at ??= now;
        session.revoke_reason = 'refresh_token_reuse';
        await manager.save(session);
        await manager.update(
          RefreshToken,
          { session_id: session.id, revoked_at: IsNull() },
          { revoked_at: now },
        );
        return { status: 'reuse' as const };
      }
      if (
        token.expires_at.getTime() <= now.getTime() ||
        session.expires_at.getTime() <= now.getTime() ||
        session.revoked_at
      ) {
        if (!token.revoked_at) {
          token.revoked_at = now;
          await manager.save(token);
        }
        return { status: 'invalid' as const };
      }

      const user = await manager.findOne(User, {
        where: { id: session.user_id },
      });
      if (!user || !user.is_active) return { status: 'invalid' as const };

      const nextRawToken = randomBytes(64).toString('base64url');
      const nextToken = await manager.save(
        manager.create(RefreshToken, {
          session_id: session.id,
          token_hash: this.hashToken(nextRawToken),
          expires_at: session.expires_at,
          consumed_at: null,
          revoked_at: null,
          replaced_by_token_id: null,
        }),
      );
      token.consumed_at = now;
      token.replaced_by_token_id = nextToken.id;
      await manager.save(token);
      session.last_used_at = now;
      session.ip_address = metadata.ip_address;
      session.user_agent = metadata.user_agent;
      await manager.save(session);

      return { status: 'ok' as const, user, session, nextRawToken };
    });

    if (result.status === 'reuse') {
      throw new UnauthorizedException(
        'Refresh token reuse detected; session revoked',
      );
    }
    if (result.status !== 'ok') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      data: {
        access_token: await this.signAccessToken(result.user, result.session),
        refresh_token: result.nextRawToken,
        token_type: 'Bearer',
        expires_in: this.accessTokenLifetimeSeconds(),
      },
      message: 'Token refreshed successfully',
    };
  }

  async logout(rawToken: string) {
    const token = await this.refreshTokenRepository.findOne({
      where: { token_hash: this.hashToken(rawToken) },
    });
    if (token) await this.revokeSessionById(token.session_id, 'logout');
    return { data: null, message: 'Logout successfully' };
  }

  async logoutAll(userId: number) {
    const sessions = await this.sessionRepository.find({
      where: { user_id: userId, revoked_at: IsNull() },
    });
    for (const session of sessions) {
      await this.revokeSessionById(session.id, 'logout_all');
    }
    return { data: null, message: 'Logged out from all devices' };
  }

  async listSessions(userId: number, currentSessionId: string) {
    const sessions = await this.sessionRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
    return {
      data: sessions.map((session) => ({
        id: session.id,
        device_name: session.device_name,
        user_agent: session.user_agent,
        ip_address: session.ip_address,
        created_at: session.created_at,
        last_used_at: session.last_used_at,
        expires_at: session.expires_at,
        revoked_at: session.revoked_at,
        revoke_reason: session.revoke_reason,
        current: session.id === currentSessionId,
      })),
      message: 'Sessions retrieved successfully',
    };
  }

  async revokeSession(userId: number, sessionId: string) {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, user_id: userId },
    });
    if (!session) throw new BadRequestException('Session not found');
    await this.revokeSessionById(session.id, 'user_revoked');
    return { data: null, message: 'Session revoked successfully' };
  }

  private async issueTokenPair(user: User, session: AuthSession) {
    const rawRefreshToken = randomBytes(64).toString('base64url');
    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        session_id: session.id,
        token_hash: this.hashToken(rawRefreshToken),
        expires_at: session.expires_at,
        consumed_at: null,
        revoked_at: null,
        replaced_by_token_id: null,
      }),
    );
    return {
      access_token: await this.signAccessToken(user, session),
      refresh_token: rawRefreshToken,
      token_type: 'Bearer',
      expires_in: this.accessTokenLifetimeSeconds(),
    };
  }

  private signAccessToken(user: User, session: AuthSession) {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        id: user.id,
        sid: session.id,
        type: 'access',
        jti: randomUUID(),
        name: user.name,
      },
      {
        expiresIn: this.configService.get<string>(
          'JWT_ACCESS_EXPIRES_IN',
          '15m',
        ) as StringValue,
      },
    );
  }

  private async revokeSessionById(sessionId: string, reason: string) {
    await this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(AuthSession, {
        where: { id: sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.revoked_at) return;
      const now = new Date();
      session.revoked_at = now;
      session.revoke_reason = reason;
      await manager.save(session);
      await manager.update(
        RefreshToken,
        { session_id: sessionId, revoked_at: IsNull() },
        { revoked_at: now },
      );
    });
  }

  private accessTokenLifetimeSeconds() {
    return Math.floor(
      this.durationMs(
        this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      ) / 1000,
    );
  }

  private durationMs(value: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(value);
    if (!match) {
      throw new Error(`Invalid duration "${value}". Use s, m, h, or d.`);
    }
    const multipliers = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return Number(match[1]) * multipliers[match[2] as keyof typeof multipliers];
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async sendVerificationEmail(email: string) {
    const response = {
      data: null,
      message:
        'If the account exists and is not verified, a verification email has been sent.',
    };
    const user = await this.userRepository.findOne({
      where: {
        email: email,
      },
    });
    if (!user || user.email_verified_at) {
      return response;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const savedVerificationToken = await this.dataSource.transaction(
      async (manager) => {
        const activeTokens = await manager.find(EmailVerificationToken, {
          where: { user_id: user.id, used_at: IsNull() },
        });
        const usedAt = new Date();
        await manager.update(
          EmailVerificationToken,
          { user_id: user.id, used_at: IsNull() },
          { used_at: usedAt },
        );
        for (const activeToken of activeTokens) {
          this.auditLogService.recordUpdate(
            'EmailVerificationToken',
            activeToken,
            { ...activeToken, used_at: usedAt },
          );
        }

        const verificationToken = manager.create(EmailVerificationToken, {
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          used_at: null,
        });

        const savedToken = await manager.save(verificationToken);
        this.auditLogService.recordCreate('EmailVerificationToken', savedToken);
        return savedToken;
      },
    );

    // dispatch event to send email
    await this.eventEmitter.emitAsync(
      APP_EVENTS.USER_REGISTERED,
      new UserRegisteredEvent(
        user.id,
        user.name,
        user.email,
        rawToken,
        savedVerificationToken.id,
      ),
    );

    return response;
  }

  async sendForgotPasswordEmail(email: string) {
    const response = {
      data: null,
      message: 'If the email exists, a password reset link has been sent.',
    };
    const user = await this.userRepository.findOne({
      where: {
        email: email,
      },
    });
    if (!user) {
      return response;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1_000);

    const savedResetToken = await this.dataSource.transaction(
      async (manager) => {
        const activeTokens = await manager.find(PasswordResetToken, {
          where: { user_id: user.id, used_at: IsNull() },
        });
        const usedAt = new Date();
        await manager.update(
          PasswordResetToken,
          { user_id: user.id, used_at: IsNull() },
          { used_at: usedAt },
        );
        for (const activeToken of activeTokens) {
          this.auditLogService.recordUpdate('PasswordResetToken', activeToken, {
            ...activeToken,
            used_at: usedAt,
          });
        }

        const resetToken = manager.create(PasswordResetToken, {
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          used_at: null,
        });

        const savedToken = await manager.save(resetToken);
        this.auditLogService.recordCreate('PasswordResetToken', savedToken);
        return savedToken;
      },
    );

    await this.eventEmitter.emitAsync(
      APP_EVENTS.USER_PASSWORD_RESET_REQUEST,
      new PasswordResetRequestedEvent(
        user.id,
        user.name,
        user.email,
        rawToken,
        savedResetToken.id,
      ),
    );

    return response;
  }

  async resetPassword(resetPasswordDTO: ResetPasswordDTO) {
    const tokenHash = this.hashToken(resetPasswordDTO.token);

    await this.dataSource.transaction(async (manager) => {
      const resetToken = await manager.findOne(PasswordResetToken, {
        where: { token_hash: tokenHash },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        !resetToken ||
        resetToken.used_at ||
        resetToken.expires_at.getTime() <= Date.now()
      ) {
        throw new BadRequestException('Token invalid or expired');
      }

      const user = await manager.findOne(User, {
        where: { id: resetToken.user_id },
      });

      if (!user) {
        throw new BadRequestException('Token invalid or expired');
      }

      if (!user.email_verified_at) {
        throw new BadRequestException('Account is not verified');
      }

      const userBefore = { ...user };
      const resetTokenBefore = { ...resetToken };
      user.password = await bcrypt.hash(resetPasswordDTO.password, 10);
      resetToken.used_at = new Date();

      await manager.save(user);
      this.auditLogService.recordUpdate('User', userBefore, user);
      await manager.save(resetToken);
      this.auditLogService.recordUpdate(
        'PasswordResetToken',
        resetTokenBefore,
        resetToken,
      );

      const revokedAt = new Date();
      await manager.update(
        AuthSession,
        { user_id: user.id, revoked_at: IsNull() },
        { revoked_at: revokedAt, revoke_reason: 'password_reset' },
      );
    });

    return {
      data: null,
      message: 'Reset password successfully',
    };
  }
}
