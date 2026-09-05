import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthService } from './auth.service';
import type { AuthRegistrationResponse, AuthSessionResponse, AuthUserResponse } from './auth.types';
import {
  EmailCredentialsDto,
  RefreshTokenDto,
  RequestOtpDto,
  UpdateProfileDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Create an account with email and password' })
  @ApiResponse({ status: 201, description: 'Account created; email confirmation may be required' })
  @ApiResponse({ status: 400, description: 'Invalid details or account creation failed' })
  register(@Body() dto: EmailCredentialsDto): Promise<AuthRegistrationResponse> {
    return this.authService.registerWithEmail(dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({ status: 200, description: 'Authenticated session created' })
  @ApiResponse({ status: 401, description: 'Invalid login credentials' })
  login(@Body() dto: EmailCredentialsDto): Promise<AuthSessionResponse> {
    return this.authService.loginWithEmail(dto.email, dto.password);
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a phone verification code' })
  @ApiResponse({ status: 200, description: 'OTP requested' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR or OTP_SEND_FAILED' })
  requestOtp(
    @Body() dto: RequestOtpDto,
  ): Promise<{ phoneMasked: string; delivery: 'sms'; resendAfterSeconds: number }> {
    return this.authService.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify phone OTP and create a session' })
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthSessionResponse> {
    return this.authService.verifyOtp(dto.phone, dto.code);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthSessionResponse> {
    return this.authService.refresh(dto);
  }

  @Patch('profile')
  @ApiBearerAuth()
  updateProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: UpdateProfileDto,
  ): Promise<AuthUserResponse> {
    return this.authService.updateProfile(this.getBearerToken(authorization), dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  logout(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ loggedOut: true }> {
    return this.authService.logout(this.getBearerToken(authorization));
  }

  @Get('me')
  @ApiBearerAuth()
  getMe(@Headers('authorization') authorization: string | undefined): Promise<AuthUserResponse> {
    return this.authService.getProfile(this.getBearerToken(authorization));
  }

  private getBearerToken(authorization: string | undefined): string {
    const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token)
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        'Authentication is required',
        HttpStatus.UNAUTHORIZED,
      );
    return token;
  }
}
