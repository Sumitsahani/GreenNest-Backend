import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { RefreshTokenDto, UpdateProfileDto } from './dto/auth.dto';
import type {
  AuthRegistrationResponse,
  AuthSessionResponse,
  AuthUserResponse,
  SupabaseEmailSignUpResponse,
  SupabaseSession,
  SupabaseUser,
} from './auth.types';

@Injectable()
export class AuthService {
  private readonly url: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>('SUPABASE_URL');
    this.apiKey = config.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY');
  }

  async registerWithEmail(email: string, password: string): Promise<AuthRegistrationResponse> {
    const response = await this.supabaseRequest<SupabaseEmailSignUpResponse>(
      '/auth/v1/signup',
      {
        method: 'POST',
        body: JSON.stringify({ email: this.normalizeEmail(email), password }),
      },
      ErrorCode.EMAIL_SIGN_UP_FAILED,
    );
    const user = this.getSignUpUser(response);
    const session = this.mapOptionalSession(response, user);
    return {
      confirmationRequired: session === null,
      user: this.mapUser(user),
      session,
    };
  }

  async loginWithEmail(email: string, password: string): Promise<AuthSessionResponse> {
    const session = await this.supabaseRequest<SupabaseSession>(
      '/auth/v1/token?grant_type=password',
      {
        method: 'POST',
        body: JSON.stringify({ email: this.normalizeEmail(email), password }),
      },
      ErrorCode.EMAIL_SIGN_IN_FAILED,
    );
    return this.mapSession(session);
  }

  async requestOtp(
    phone: string,
  ): Promise<{ phoneMasked: string; delivery: 'sms'; resendAfterSeconds: number }> {
    const normalizedPhone = this.normalizePhone(phone);
    await this.supabaseRequest(
      '/auth/v1/otp',
      {
        method: 'POST',
        body: JSON.stringify({ phone: normalizedPhone, create_user: true }),
      },
      ErrorCode.OTP_SEND_FAILED,
    );
    return { phoneMasked: `+91 ••••••${phone.slice(-4)}`, delivery: 'sms', resendAfterSeconds: 60 };
  }

  async verifyOtp(phone: string, code: string): Promise<AuthSessionResponse> {
    const session = await this.supabaseRequest<SupabaseSession>(
      '/auth/v1/verify',
      {
        method: 'POST',
        body: JSON.stringify({ phone: this.normalizePhone(phone), token: code, type: 'sms' }),
      },
      ErrorCode.OTP_INVALID,
    );
    return this.mapSession(session);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthSessionResponse> {
    const session = await this.supabaseRequest<SupabaseSession>(
      '/auth/v1/token?grant_type=refresh_token',
      { method: 'POST', body: JSON.stringify({ refresh_token: dto.refreshToken }) },
      ErrorCode.UNAUTHORIZED,
    );
    return this.mapSession(session);
  }

  async updateProfile(token: string, dto: UpdateProfileDto): Promise<AuthUserResponse> {
    const user = await this.supabaseRequest<SupabaseUser>(
      '/auth/v1/user',
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: dto }),
      },
      ErrorCode.UNAUTHORIZED,
    );
    return this.mapUser(user);
  }

  async logout(token: string): Promise<{ loggedOut: true }> {
    await this.supabaseRequest(
      '/auth/v1/logout',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
      ErrorCode.UNAUTHORIZED,
    );
    return { loggedOut: true };
  }

  private async supabaseRequest<T = unknown>(
    path: string,
    init: RequestInit,
    code: ErrorCode,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.url}${path}`, {
        ...init,
        headers: { apikey: this.apiKey, 'Content-Type': 'application/json', ...init.headers },
      });
    } catch {
      throw new BusinessException(
        ErrorCode.AUTH_PROVIDER_ERROR,
        'Authentication service is unavailable',
        HttpStatus.BAD_GATEWAY,
      );
    }
    if (!response.ok) {
      const unauthorized =
        code === ErrorCode.UNAUTHORIZED || code === ErrorCode.EMAIL_SIGN_IN_FAILED;
      throw new BusinessException(
        code,
        code === ErrorCode.OTP_INVALID
          ? 'The verification code is invalid or expired'
          : code === ErrorCode.EMAIL_SIGN_IN_FAILED
            ? 'Invalid email or password'
            : code === ErrorCode.EMAIL_SIGN_UP_FAILED
              ? 'Account could not be created'
              : 'Authentication request could not be completed',
        code === ErrorCode.AUTH_PROVIDER_ERROR
          ? HttpStatus.BAD_GATEWAY
          : unauthorized
            ? HttpStatus.UNAUTHORIZED
            : HttpStatus.BAD_REQUEST,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private normalizePhone(phone: string): string {
    return `+91${phone}`;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async getProfile(token: string): Promise<AuthUserResponse> {
    const user = await this.supabaseRequest<SupabaseUser>(
      '/auth/v1/user',
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      ErrorCode.UNAUTHORIZED,
    );
    return this.mapUser(user);
  }

  private mapSession(session: SupabaseSession): AuthSessionResponse {
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      tokenType: session.token_type,
      user: this.mapUser(session.user),
    };
  }

  private getSignUpUser(response: SupabaseEmailSignUpResponse): SupabaseUser {
    if (response.user) return response.user;
    if (typeof response.id === 'string') {
      return {
        id: response.id,
        phone: response.phone,
        email: response.email,
        user_metadata: response.user_metadata,
      };
    }
    throw new BusinessException(
      ErrorCode.AUTH_PROVIDER_ERROR,
      'Authentication service returned an invalid response',
      HttpStatus.BAD_GATEWAY,
    );
  }

  private mapOptionalSession(
    response: SupabaseEmailSignUpResponse,
    user: SupabaseUser,
  ): AuthSessionResponse | null {
    if (
      typeof response.access_token !== 'string' ||
      typeof response.refresh_token !== 'string' ||
      typeof response.expires_in !== 'number' ||
      typeof response.token_type !== 'string'
    ) {
      return null;
    }
    return this.mapSession({
      access_token: response.access_token,
      refresh_token: response.refresh_token,
      expires_in: response.expires_in,
      token_type: response.token_type,
      user,
    });
  }

  private mapUser(user: SupabaseUser): AuthUserResponse {
    const metadata = user.user_metadata ?? {};
    return {
      id: user.id,
      phone: user.phone ?? null,
      email: user.email ?? null,
      name: typeof metadata.name === 'string' ? metadata.name : null,
      location: typeof metadata.location === 'string' ? metadata.location : null,
      experience: typeof metadata.experience === 'string' ? metadata.experience : null,
      avatarUrl:
        typeof metadata.avatarUrl === 'string'
          ? metadata.avatarUrl
          : typeof metadata.avatar_url === 'string'
            ? metadata.avatar_url
            : null,
    };
  }
}
