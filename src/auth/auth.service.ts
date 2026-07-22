import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { LoginDTO, RegisterDTO } from "./auth.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { User, UserStatus } from "src/user/user.entity";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from 'bcrypt';
import { EmailVerificationToken } from "src/user/email-verification-tokens.entity";
import { createHash, randomBytes } from "crypto";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { UserRegisteredEvent } from "./events/user-registered.event";
import { APP_EVENTS } from "src/common/constants/event.constants";

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(EmailVerificationToken)
        private readonly emailVerificationRepository: Repository<EmailVerificationToken>,
        private jwtService: JwtService,
        private eventEmitter: EventEmitter2
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
        const verifycationToken = await this.emailVerificationRepository.create({
            user_id: savedUser.id,
            token_hash: tokenHash,
            expires_at: expiresAt,
            used_at: null,
        })
        await this.emailVerificationRepository.save(verifycationToken);

        // dispatch event to send email
        this.eventEmitter.emit(APP_EVENTS.USER_REGISTERED, new UserRegisteredEvent(savedUser.id, savedUser.name, savedUser.email, rawToken));

        return {
            data: savedUser,
            message: 'Register account successfully, please verify it.'
        };
    }

    async verifyAccount(tokenHash: string) {
        if (!tokenHash) {
            throw new BadRequestException('Token must not be empty')
        }
        const verificationToken =
            await this.emailVerificationRepository.findOne({
                where: {
                    token_hash: tokenHash,
                },
                relations: {
                    user: true,
                },
            });

        if (!verificationToken) {
            throw new BadRequestException(
                'Token invalid',
            );
        }

        if (verificationToken.used_at) {
            throw new BadRequestException(
                'Token already verified',
            );
        }

        if (verificationToken.expires_at.getTime() <= Date.now()) {
            throw new BadRequestException(
                'Token expired',
            );
        }

        const user = verificationToken.user;

        if (!user) {
            throw new BadRequestException(
                'Account not found',
            );
        }

        if (user.email_verified_at) {
            throw new BadRequestException(
                'Account already verifed',
            );
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
}
