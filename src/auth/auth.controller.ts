import { Body, Controller, Post } from "@nestjs/common";
import { RegisterDTO, LoginDTO } from "./auth.dto";
import { AuthService } from "./auth.service";

@Controller('auth')
export class AuthController {

    constructor(private authService: AuthService) {}

    @Post('register')
    register(@Body() userDto: RegisterDTO) {
        return this.authService.register(userDto)
    }

    @Post('login')
    login(@Body() credentials: LoginDTO) {

    }
}
