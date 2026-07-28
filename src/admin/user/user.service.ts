import { Injectable } from '@nestjs/common';
import { User } from '../../user/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  getUsers() {
    return this.userRepository.find({
      select: {
        id: true,
        name: true,
        email: true,
        is_active: true,
        email_verified_at: true,
        createdAt: true,
        updatedAt: true,
      },
      order: {
        id: 'DESC',
      },
    });
  }
}
