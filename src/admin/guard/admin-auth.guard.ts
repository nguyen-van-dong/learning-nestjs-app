import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Admin } from '../../user/admin.entity';
import { AdminJwtPayload } from '../interfaces/admin-jwt-payload.interface';

interface AdminRequest extends Request {
  admin?: Admin;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = this.extractToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Unauthorized');
    }

    let payload: AdminJwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<AdminJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }

    if (payload.actor !== 'admin' || !payload.sub) {
      throw new ForbiddenException('Admin access required');
    }

    const admin = await this.adminRepository.findOne({
      where: { id: payload.sub },
      relations: {
        adminRoles: {
          role: {
            permissions: {
              permission: true,
            },
          },
        },
      },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin account not found');
    }

    if (!admin.is_active) {
      throw new ForbiddenException('Admin account is inactive');
    }

    request.admin = admin;
    return true;
  }

  private extractToken(authorization?: string): string | undefined {
    const [type, token] = authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
