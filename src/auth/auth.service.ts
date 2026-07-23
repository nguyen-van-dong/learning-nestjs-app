import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { LoginDTO, RegisterDTO, ResetPasswordDTO } from "./auth.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { User } from "src/user/user.entity";
import { DataSource, IsNull, Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from 'bcrypt';
import { EmailVerificationToken } from "src/user/email-verification-tokens.entity";
import { createHash, randomBytes } from "crypto";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { UserRegisteredEvent } from "./events/user-registered.event";
import { APP_EVENTS } from "src/common/constants/event.constants";
import { PasswordResetToken } from "src/user/password-reset-token.entity";
import { PasswordResetRequestedEvent } from "./events/password-reset-requested.event";

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
    ) { }

    async register(userDto: RegisterDTO) {
        const existingUser = await this.userRepository.findOne({
            where: {
                email: userDto.email
            }
        });
        if (existingUser) {
            throw new BadRequestException('User already exists');
        }
        // Hash password
        const saltOrRounds = 10;
        const hashed = await bcrypt.hash(userDto.password, saltOrRounds);
        const user = await this.userRepository.create({
            name: userDto.name,
            email: userDto.email,
            password: hashed,
        }) // Create an entity
        const savedUser = await this.userRepository.save(user); // Save entity to DB

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(rawToken);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        const verificationToken = this.emailVerificationRepository.create({
            user_id: savedUser.id,
            token_hash: tokenHash,
            expires_at: expiresAt,
            used_at: null,
        })
        const savedVerificationToken =
            await this.emailVerificationRepository.save(verificationToken);

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
            message: 'Register account successfully, please verify it.'
        };
    }

    async verifyAccount(token: string) {
        if (!token) {
            throw new BadRequestException('Token must not be empty')
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

        user.email_verified_at = verifiedAt;
        user.is_active = true;

        verificationToken.used_at = verifiedAt;

        await this.userRepository.save(user);

        await this.emailVerificationRepository.save(
            verificationToken,
        );
        return {
            data: user,
            message: 'Verify account successfully'
        };
    }

    async login(userDto: LoginDTO) {
        const user = await this.userRepository.findOne({
            where: {
                email: userDto.email,
            }
        })
        if (!user) {
            throw new ForbiddenException('Invalid email or password')
        }
        if (!user.is_active) {
            throw new BadRequestException('Account is not actived, please verify it.')
        }
        
        const isMatchPassword = await bcrypt.compare(userDto.password, user.password)
        if (!isMatchPassword) {
            throw new BadRequestException('Invalid email or password')
        }
        const payload = {
            id: user.id,
            name: user.name,
            role: user.role
        }
        const token = await this.jwtService.signAsync(payload, {
            secret: process.env.JWT_SECRET
        })
        return {
            data: {...user, token },
            message: 'Login successfully'
        }
    }

    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    async sendVerificationEmail(email: string) {
        const response = {
            data: null,
            message: 'If the account exists and is not verified, a verification email has been sent.'
        };
        const user = await this.userRepository.findOne({
            where: {
                email: email
            }
        })
        if (!user || user.email_verified_at) {
            return response;
        }

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(rawToken);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        const savedVerificationToken = await this.dataSource.transaction(
            async (manager) => {
                await manager.update(
                    EmailVerificationToken,
                    { user_id: user.id, used_at: IsNull() },
                    { used_at: new Date() },
                );

                const verificationToken = manager.create(
                    EmailVerificationToken,
                    {
                        user_id: user.id,
                        token_hash: tokenHash,
                        expires_at: expiresAt,
                        used_at: null,
                    },
                );

                return manager.save(verificationToken);
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
            message: 'If the email exists, a password reset link has been sent.'
        };
        const user = await this.userRepository.findOne({
            where: {
                email: email
            }
        })
        if (!user) {
            return response;
        }

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1_000);

        const savedResetToken = await this.dataSource.transaction(
            async (manager) => {
                await manager.update(
                    PasswordResetToken,
                    { user_id: user.id, used_at: IsNull() },
                    { used_at: new Date() },
                );

                const resetToken = manager.create(PasswordResetToken, {
                    user_id: user.id,
                    token_hash: tokenHash,
                    expires_at: expiresAt,
                    used_at: null,
                });

                return manager.save(resetToken);
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

            user.password = await bcrypt.hash(
                resetPasswordDTO.password,
                10,
            );
            resetToken.used_at = new Date();

            await manager.save(user);
            await manager.save(resetToken);
        });

        return {
            data: null,
            message: 'Reset password successfully'
        }
    }
}
