import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  RegisterDTO,
  LoginDTO,
  VerifyAccountDTO,
  ResetPasswordDTO,
  EmailDTO,
  RefreshTokenDTO,
} from './auth.dto';
import { AuthService } from './auth.service';
import { AuditAction } from 'src/audit-log/decorators/audit-action.decorator';
import { SkipAudit } from 'src/audit-log/decorators/skip-audit.decorator';
import { AuthGuard } from 'src/guards/auth.guard';
import { AccessTokenPayload } from './interfaces/access-token-payload.interface';

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
  login(@Body() credentials: LoginDTO, @Req() request: Request) {
    return this.authService.login(credentials, this.requestMetadata(request));
  }

  @Post('refresh')
  @SkipAudit()
  refresh(@Body() dto: RefreshTokenDTO, @Req() request: Request) {
    return this.authService.refresh(
      dto.refresh_token,
      this.requestMetadata(request),
    );
  }

  @Post('logout')
  @SkipAudit()
  logout(@Body() dto: RefreshTokenDTO) {
    return this.authService.logout(dto.refresh_token);
  }

  @Post('logout-all')
  @UseGuards(AuthGuard)
  logoutAll(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.authService.logoutAll(request.user.sub);
  }

  @Get('sessions')
  @UseGuards(AuthGuard)
  sessions(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.authService.listSessions(request.user.sub, request.user.sid);
  }

  @Post('sessions/:id/revoke')
  @UseGuards(AuthGuard)
  revokeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request & { user: AccessTokenPayload },
  ) {
    return this.authService.revokeSession(request.user.sub, id);
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

  private requestMetadata(request: Request) {
    return {
      ip_address: request.ip?.slice(0, 100) ?? null,
      user_agent: request.get('user-agent')?.slice(0, 1000) ?? null,
    };
  }
}
