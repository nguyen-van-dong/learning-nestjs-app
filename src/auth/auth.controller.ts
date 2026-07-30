import { Body, Controller, Post } from '@nestjs/common';
import {
  RegisterDTO,
  LoginDTO,
  VerifyAccountDTO,
  ResetPasswordDTO,
  EmailDTO,
} from './auth.dto';
import { AuthService } from './auth.service';
import { AuditAction } from 'src/audit-log/decorators/audit-action.decorator';
import { SkipAudit } from 'src/audit-log/decorators/skip-audit.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @AuditAction('USER_REGISTERED')
  register(@Body() userDto: RegisterDTO) {
    return this.authService.register(userDto);
  }

  @Post('verify-account')
  @AuditAction('USER_VERIFIED')
  verify(@Body() verifyDTO: VerifyAccountDTO) {
    return this.authService.verifyAccount(verifyDTO.token);
  }

  @Post('login')
  @SkipAudit()
  login(@Body() credentials: LoginDTO) {
    return this.authService.login(credentials);
  }

  @Post('send-verification-email')
  @AuditAction('VERIFICATION_EMAIL_REQUESTED')
  sendVerificationEmail(@Body() emailDTO: EmailDTO) {
    return this.authService.sendVerificationEmail(emailDTO.email);
  }

  @Post('forgot-password')
  @AuditAction('PASSWORD_RESET_REQUESTED')
  forgotPassword(@Body() emailDTO: EmailDTO) {
    return this.authService.sendForgotPasswordEmail(emailDTO.email);
  }

  @Post('reset-password')
  @AuditAction('PASSWORD_RESET')
  resetPassword(@Body() resetPasswordDTO: ResetPasswordDTO) {
    return this.authService.resetPassword(resetPasswordDTO);
  }
}
