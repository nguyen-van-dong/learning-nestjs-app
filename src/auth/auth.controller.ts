import { Body, Controller, Post, Get, Query } from "@nestjs/common";
import { RegisterDTO, LoginDTO, VerifyAccountDTO } from "./auth.dto";
import { AuthService } from "./auth.service";

@Controller('auth')
export class AuthController {

    constructor(private authService: AuthService) {}

    @Post('register')
    register(@Body() userDto: RegisterDTO) {
        return this.authService.register(userDto)
    }

    @Post('verify-account')
    verify(@Body() verifyDTO: VerifyAccountDTO) {
        return this.authService.verifyAccount(verifyDTO.token)
    }

    @Post('login')
    login(@Body() credentials: LoginDTO) {
        return this.authService.login(credentials)
    }
}
