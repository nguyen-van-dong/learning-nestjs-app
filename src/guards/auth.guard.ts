import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthSession } from 'src/auth/auth-session.entity';
import { Repository } from 'typeorm';
import { AccessTokenPayload } from 'src/auth/interfaces/access-token-payload.interface';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AccessTokenPayload }>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Unauthorized');
    }
    try {
      const payload =
        await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      if (payload.type !== 'access' || !payload.sid || !payload.sub) {
        throw new UnauthorizedException('Invalid access token');
      }
      const session = await this.sessionRepository.findOne({
        where: { id: payload.sid, user_id: payload.sub },
        relations: { user: true },
      });
      if (
        !session ||
        !session.user.is_active ||
        session.revoked_at ||
        session.expires_at.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('Session is no longer active');
      }
      request.user = payload;
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
