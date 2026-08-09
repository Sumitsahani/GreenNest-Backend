import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { ErrorCode } from '../constants/error-code';
import { BusinessException } from '../exceptions/business.exception';
import type { ApiErrorResponse } from '../types/api-response.types';
import type { RequestWithId } from '../types/request-with-id';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const mapped = this.mapException(exception);
    const payload: ApiErrorResponse = {
      success: false,
      error: {
        code: mapped.code,
        message: mapped.message,
        field: mapped.field,
        details: mapped.details,
        requestId: request.requestId,
      },
    };
    if (mapped.status >= 500) {
      this.logger.error(
        JSON.stringify({
          requestId: request.requestId,
          method: request.method,
          endpoint: request.originalUrl,
          status: mapped.status,
          errorCode: mapped.code,
        }),
      );
    }
    response.status(mapped.status).json(payload);
  }

  private mapException(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    field: string | null;
    details: unknown;
  } {
    if (exception instanceof BusinessException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        field: exception.context.field ?? null,
        details: exception.context.details ?? null,
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.RESOURCE_ALREADY_EXISTS,
          message: 'A resource with these details already exists',
          field: null,
          details: null,
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: 'The requested resource was not found',
          field: null,
          details: null,
        };
      }
    }
    if (exception instanceof BadRequestException) {
      const body = exception.getResponse();
      const details = typeof body === 'object' && body !== null ? body : null;
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Please correct the highlighted fields',
        field: null,
        details,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: this.defaultCodeForStatus(status),
        message: exception.message,
        field: null,
        details: null,
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Something went wrong. Please try again.',
      field: null,
      details: null,
    };
  }

  private defaultCodeForStatus(status: number): ErrorCode {
    if (status === 401) return ErrorCode.UNAUTHORIZED;
    if (status === 403) return ErrorCode.FORBIDDEN;
    if (status === 404) return ErrorCode.NOT_FOUND;
    if (status === 503) return ErrorCode.SERVICE_UNAVAILABLE;
    return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_ERROR;
  }
}
