import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { RequestWithId } from '../types/request-with-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const incoming = request.header('x-request-id');
    request.requestId = incoming?.trim() || `req_${randomUUID()}`;
    response.setHeader('X-Request-ID', request.requestId);
    next();
  }
}
