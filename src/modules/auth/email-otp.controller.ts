import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { EmailOtpService } from './email-otp.service';

class RequestEmailOtpDto {
  @IsEmail() @MaxLength(254) email!: string;
}
class VerifyEmailOtpDto extends RequestEmailOtpDto {
  @IsString() @Matches(/^\d{6,8}$/) code!: string;
}
@Controller('auth/email/otp')
export class EmailOtpController {
  constructor(private readonly otp: EmailOtpService) {}
  @Post('request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  request(@Body() dto: RequestEmailOtpDto): ReturnType<EmailOtpService['request']> {
    return this.otp.request(dto.email);
  }
  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  verify(@Body() dto: VerifyEmailOtpDto): ReturnType<EmailOtpService['verify']> {
    return this.otp.verify(dto.email, dto.code);
  }
}
