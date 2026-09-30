import type { Request } from 'express';

export interface RequestWithId extends Request {
  requestId: string;
  startedAt?: number;
}
