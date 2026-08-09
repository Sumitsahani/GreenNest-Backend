import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../constants/error-code';
import { BusinessException } from '../exceptions/business.exception';
import type { AuthenticatedRequest, AuthenticatedUser } from './authenticated-user';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) this.unauthorized();
    const response = await fetch(`${this.config.getOrThrow<string>('SUPABASE_URL')}/auth/v1/user`, {
      headers: { apikey: this.config.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY'), Authorization: `Bearer ${token}` },
    });
    if (!response.ok) this.unauthorized();
    const user = (await response.json()) as AuthenticatedUser;
    request.authUser = { id: user.id, email: user.email ?? null, phone: user.phone ?? null };
    return true;
  }

  private unauthorized(): never {
    throw new BusinessException(ErrorCode.UNAUTHORIZED, 'Your session is invalid or expired', HttpStatus.UNAUTHORIZED);
  }
}
