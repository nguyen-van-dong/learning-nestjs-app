import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.getOrThrow<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT', 587),
      secure: this.configService.get<number>('MAIL_PORT', 587) === 465,
      auth: {
        user: this.configService.getOrThrow<string>('MAIL_USER'),
        pass: this.configService.getOrThrow<string>('MAIL_PASSWORD'),
      },
    });
  }

  async sendVerificationEmail(params: {
    name: string;
    email: string;
    verificationUrl: string;
  }): Promise<void> {
    await this.transporter.sendMail({
      from: this.configService.getOrThrow<string>('MAIL_FROM'),
      to: params.email,
      subject: 'Verify your account',
      html: `
        <h2>Hello ${params.name}</h2>
        <p>Thank you for registering an account.</p>
        <p>
          Please click the link below to verify your account:
        </p>
        <p>
          <a href="${params.verificationUrl}">
            Verify account
          </a>
        </p>
        <p>This link will expire in 24 hours.</p>
      `,
    });
  }

  async sendResetPasswordEmail(params: {
    name: string;
    email: string;
    resetPasswordUrl: string;
  }): Promise<void> {
    await this.transporter.sendMail({
      from: this.configService.getOrThrow<string>('MAIL_FROM'),
      to: params.email,
      subject: 'Reset your password',
      html: `
        <h2>Hello ${params.name}</h2>
        <p>We received a request to reset your password.</p>
        <p>
          <a href="${params.resetPasswordUrl}">
            Reset password
          </a>
        </p>
        <p>This link will expire in 1 hour.</p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    });
  }
}
