import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Admin } from '../../user/admin.entity';
import { AdminLoginDto } from './dto/admin-login.dto';

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
    private readonly jwtService: JwtService,
  ) {}

  async login(credentials: AdminLoginDto) {
    const admin = await this.adminRepository.findOne({
      where: { email: credentials.email },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      credentials.password,
      admin.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!admin.is_active) {
      throw new ForbiddenException('Admin account is inactive');
    }

    const token = await this.jwtService.signAsync({
      sub: admin.id,
      actor: 'admin',
    });

    return {
      data: {
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          is_super_admin: admin.is_super_admin,
        },
        token,
      },
      message: 'Login successfully',
    };
  }
}
