import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { renderEmailOtp } from './email-otp.template';

@Injectable()
export class EmailService {
  private transporter?: Transporter;
  constructor(private readonly config: ConfigService) {}

  assertConfigured(): void {
    if (
      ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'].some(
        (key) => !this.config.get<string>(key),
      )
    )
      throw new BusinessException(
        ErrorCode.OTP_SEND_FAILED,
        'Email delivery is not configured. Please try another sign-in method.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
  }

  async sendOtp(email: string, otp: string, expiryMinutes: number): Promise<void> {
    this.assertConfigured();
    this.transporter ??= nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT', 587)),
      secure: String(this.config.get('SMTP_SECURE', false)) === 'true',
      requireTLS: true,
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASSWORD'),
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      logger: false,
      debug: false,
    });
    try {
      const result = await this.transporter.sendMail({
        from: this.config.getOrThrow<string>('SMTP_FROM'),
        to: email,
        subject: 'Your GreenNest verification code',
        text: `Your GreenNest verification code is ${otp}. It expires in ${expiryMinutes} minutes. If you did not request this code, ignore this email.`,
        html: renderEmailOtp(otp, expiryMinutes),
      });
      if (!result.accepted?.length || result.rejected?.length)
        throw new Error('Recipient not accepted');
    } catch {
      // SMTP errors may contain credentials, addresses, or message content.
      throw new BusinessException(
        ErrorCode.OTP_SEND_FAILED,
        'The email could not be sent. Please retry after the countdown.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
