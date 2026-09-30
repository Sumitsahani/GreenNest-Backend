import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../constants/error-code';
import { BusinessException } from '../exceptions/business.exception';
import type { AuthenticatedRequest, AuthenticatedUser } from './authenticated-user';
import { createHash } from 'node:crypto';

// Guards are instantiated by multiple modules. Share only requests currently
// being verified, never a completed decision (suspension stays immediate).
const verifications = new Map<string, Promise<AuthenticatedUser>>();

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) this.unauthorized();
    request.authUser = await this.authenticate(token);
    return true;
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const key = createHash('sha256')
      .update(`${this.config.getOrThrow<string>('SUPABASE_URL')}\0${token}`)
      .digest('hex');
    const existing = verifications.get(key);
    if (existing) return existing;
    const pending = this.verify(token);
    // Bound memory if a client floods unique tokens.
    if (verifications.size < 1000) verifications.set(key, pending);
    try {
      return await pending;
    } finally {
      if (verifications.get(key) === pending) verifications.delete(key);
    }
  }

  private async verify(token: string): Promise<AuthenticatedUser> {
    let response: Response;
    try {
      response = await fetch(`${this.config.getOrThrow<string>('SUPABASE_URL')}/auth/v1/user`, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          apikey: this.config.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY'),
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      this.unavailable();
    }
    if (response.status === 401 || response.status === 403) this.unauthorized();
    if (!response.ok) this.unavailable();
    let user: AuthenticatedUser & {
      app_metadata?: { role?: string; suspended?: boolean };
    };
    try {
      user = (await response.json()) as typeof user;
    } catch {
      this.unavailable();
    }
    if (!user || typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id))
      this.unavailable();
    if (user.app_metadata?.suspended === true)
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        'Your account is suspended. Contact support.',
        HttpStatus.FORBIDDEN,
      );
    return {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      ...(user.app_metadata?.role === 'ADMIN' ? { role: 'ADMIN' as const } : {}),
    };
  }

  private unauthorized(): never {
    throw new BusinessException(
      ErrorCode.UNAUTHORIZED,
      'Your session is invalid or expired',
      HttpStatus.UNAUTHORIZED,
    );
  }
  private unavailable(): never {
    throw new BusinessException(
      ErrorCode.AUTH_PROVIDER_ERROR,
      'Authentication service is temporarily unavailable. Please retry.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
