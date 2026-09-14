import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import type { AuthSessionResponse } from './auth.types';

@Injectable()
export class EmailOtpService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly auth: AuthService,
  ) {}

  private configured(): void {
    this.email.assertConfigured();
    if (
      !this.config.get<string>('OTP_HASH_SECRET') ||
      !this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')
    )
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Email verification is not configured. Please use another sign-in method.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
  }
  private digest(email: string, otp: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('OTP_HASH_SECRET'))
      .update(`${email}:${otp}`)
      .digest('hex');
  }

  async request(
    rawEmail: string,
  ): Promise<{
    sent: true;
    resendAfterSeconds: number;
    otpLength: number;
    expiresInSeconds: number;
  }> {
    this.configured();
    const email = rawEmail.trim().toLowerCase();
    const length = Number(this.config.get('OTP_LENGTH', 6));
    const expiry = Number(this.config.get('OTP_EXPIRY_MINUTES', 10));
    const cooldown = Number(this.config.get('OTP_RESEND_COOLDOWN_SECONDS', 60));
    const otp = randomInt(0, 10 ** length)
      .toString()
      .padStart(length, '0');
    const otpHash = this.digest(email, otp);
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`email-otp:${email}`}, 0))::text`;
      const old = await tx.emailOtp.findUnique({ where: { email } });
      const wait = old
        ? cooldown - Math.floor((now.getTime() - old.createdAt.getTime()) / 1000)
        : 0;
      if (wait > 0)
        throw new BusinessException(
          ErrorCode.OTP_COOLDOWN,
          'Please wait before requesting another code.',
          HttpStatus.TOO_MANY_REQUESTS,
          { details: { retryAfterSeconds: wait } },
        );
      const sameWindow = old && now.getTime() - old.windowStart.getTime() < 3_600_000;
      if (sameWindow && old.requestCount >= 5)
        throw new BusinessException(
          ErrorCode.OTP_COOLDOWN,
          'Too many email requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
          {
            details: {
              retryAfterSeconds: Math.ceil(
                (old.windowStart.getTime() + 3_600_000 - now.getTime()) / 1000,
              ),
            },
          },
        );
      const data = {
        otpHash,
        expiresAt: new Date(now.getTime() + expiry * 60_000),
        attemptCount: 0,
        createdAt: now,
        sentAt: null,
        verifiedAt: null,
        usedAt: null,
        windowStart: sameWindow ? old.windowStart : now,
        requestCount: sameWindow ? old.requestCount + 1 : 1,
      };
      await tx.emailOtp.upsert({ where: { email }, create: { email, ...data }, update: data });
      await tx.emailOtp.deleteMany({
        where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } },
      });
    });
    await this.email.sendOtp(email, otp, expiry);
    await this.db.emailOtp.updateMany({
      where: { email, otpHash, usedAt: null },
      data: { sentAt: new Date() },
    });
    return {
      sent: true,
      resendAfterSeconds: cooldown,
      otpLength: length,
      expiresInSeconds: expiry * 60,
    };
  }

  async verify(rawEmail: string, code: string): Promise<AuthSessionResponse> {
    this.configured();
    const email = rawEmail.trim().toLowerCase();
    const maxAttempts = Number(this.config.get('MAX_OTP_ATTEMPTS', 5));
    // Return failure from the transaction so incorrect-attempt increments commit.
    const failure = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`email-otp:${email}`}, 0))::text`;
      const otp = await tx.emailOtp.findUnique({ where: { email } });
      if (!otp || !otp.sentAt) return ErrorCode.OTP_INVALID;
      if (otp.usedAt) return ErrorCode.OTP_USED;
      if (otp.expiresAt <= new Date()) return ErrorCode.OTP_EXPIRED;
      if (otp.attemptCount >= maxAttempts) return ErrorCode.OTP_ATTEMPTS_EXCEEDED;
      const valid = timingSafeEqual(
        Buffer.from(otp.otpHash, 'hex'),
        Buffer.from(this.digest(email, code), 'hex'),
      );
      if (!valid) {
        await tx.emailOtp.update({ where: { email }, data: { attemptCount: { increment: 1 } } });
        return otp.attemptCount + 1 >= maxAttempts
          ? ErrorCode.OTP_ATTEMPTS_EXCEEDED
          : ErrorCode.OTP_INVALID;
      }
      const now = new Date();
      await tx.emailOtp.update({ where: { email }, data: { usedAt: now, verifiedAt: now } });
      return null;
    });
    if (failure) {
      const messages: Partial<Record<ErrorCode, string>> = {
        OTP_INVALID: 'The verification code is incorrect.',
        OTP_EXPIRED: 'This code has expired. Request a new code.',
        OTP_USED: 'This code has already been used. Request a new code.',
        OTP_ATTEMPTS_EXCEEDED:
          'Too many incorrect attempts. Request a new code after the countdown.',
      };
      throw new BusinessException(
        failure,
        messages[failure]!,
        failure === ErrorCode.OTP_ATTEMPTS_EXCEEDED
          ? HttpStatus.TOO_MANY_REQUESTS
          : HttpStatus.BAD_REQUEST,
      );
    }
    // Keep Supabase as the session authority. Only a consumed local OTP permits this exchange.
    return this.auth.sessionForVerifiedEmail(email);
  }
}
