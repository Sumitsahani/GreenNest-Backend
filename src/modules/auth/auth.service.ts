import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { RefreshTokenDto, UpdateProfileDto } from './dto/auth.dto';
import type {
  AuthSessionResponse,
  AuthUserResponse,
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
      throw new BusinessException(
        code,
        code === ErrorCode.OTP_INVALID
          ? 'The verification code is invalid or expired'
          : 'Authentication request could not be completed',
        code === ErrorCode.AUTH_PROVIDER_ERROR ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private normalizePhone(phone: string): string {
    return `+91${phone}`;
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
