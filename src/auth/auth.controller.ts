import { Body, Controller, Post } from "@nestjs/common";
import { RegisterDTO, LoginDTO, VerifyAccountDTO, ResetPasswordDTO, EmailDTO } from "./auth.dto";
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

    @Post('send-verification-email')
    sendVerificationEmail(@Body() emailDTO: EmailDTO) {
        return this.authService.sendVerificationEmail(emailDTO.email)
    }

    @Post('forgot-password')
    forgotPassword(@Body() emailDTO: EmailDTO) {
        return this.authService.sendForgotPasswordEmail(emailDTO.email)
    }

    @Post('reset-password')
    resetPassword(@Body() resetPasswordDTO: ResetPasswordDTO) {
        return this.authService.resetPassword(resetPasswordDTO)
    }
}
