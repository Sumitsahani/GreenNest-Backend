import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedUser { id: string; email: string | null; phone: string | null }
export interface AuthenticatedRequest extends Request { authUser?: AuthenticatedUser }

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().authUser;
    if (!user) throw new Error('Authenticated user is missing');
    return user;
  },
);
