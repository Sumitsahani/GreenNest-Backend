import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';

@Injectable()
export class SupportAgentGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configured = this.config.get<string>('SUPPORT_API_KEY');
    const provided = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>()
      .headers['x-support-key'];
    if (
      !configured ||
      typeof provided !== 'string' ||
      !this.matches(configured, provided)
    ) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        'Support agent access is not authorized',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }

  private matches(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }
}
