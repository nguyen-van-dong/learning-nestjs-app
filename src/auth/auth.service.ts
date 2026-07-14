import { BadRequestException, Injectable } from "@nestjs/common";
import { RegisterDTO } from "./auth.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { User } from "src/user/user.entity";
import { Repository } from "typeorm";

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>
    ) {}
    async register(userDto: RegisterDTO) {
        const existingUser = await this.userRepository.findOne({ where: {
            email: userDto.email
        }});
        if (existingUser) {
            throw new BadRequestException('User already exists');
        }
        const user = await this.userRepository.create({
            name: userDto.name,
            email: userDto.email,
            password: userDto.password,
        })
        return this.userRepository.save(user);
    }
}
