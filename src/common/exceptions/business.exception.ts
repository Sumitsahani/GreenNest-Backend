import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '../constants/error-code';

export interface BusinessExceptionOptions {
  field?: string;
  details?: unknown;
}

export class BusinessException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    public readonly context: BusinessExceptionOptions = {},
  ) {
    super(message, status);
  }
}
