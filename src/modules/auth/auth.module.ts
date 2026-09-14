import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailOtpController } from './email-otp.controller';
import { EmailOtpService } from './email-otp.service';
import { EmailService } from './email.service';

@Module({
  controllers: [AuthController, EmailOtpController],
  providers: [AuthService, EmailService, EmailOtpService],
})
export class AuthModule {}
