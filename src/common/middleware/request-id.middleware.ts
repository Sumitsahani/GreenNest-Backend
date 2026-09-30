import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { RequestWithId } from '../types/request-with-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const incoming = request.header('x-request-id');
    request.requestId = incoming?.trim() || `req_${randomUUID()}`;
    request.startedAt = Date.now();
    response.setHeader('X-Request-ID', request.requestId);
    response.once('finish', () =>
      this.logger.log(
        JSON.stringify({
          requestId: request.requestId,
          method: request.method,
          endpoint: request.path,
          status: response.statusCode,
          durationMs: Date.now() - request.startedAt!,
        }),
      ),
    );
    next();
  }
}
