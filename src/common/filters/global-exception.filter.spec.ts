import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GlobalExceptionFilter } from './global-exception.filter';

it.each([
  new Prisma.PrismaClientUnknownRequestError('FATAL: (EMAXCONNSESSION) max clients reached', {
    clientVersion: '6.19.3',
  }),
  new Prisma.PrismaClientKnownRequestError('Pool wait expired', {
    code: 'P2024',
    clientVersion: '6.19.3',
  }),
])('returns a retryable, sanitized response for database pool exhaustion', (error) => {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const request = { requestId: 'req_test', method: 'GET', originalUrl: '/api/v1/settings' };
  const context = {
    getRequest: (): typeof request => request,
    getResponse: (): typeof response => response,
  };
  const host = { switchToHttp: (): typeof context => context } as unknown as ArgumentsHost;
  new GlobalExceptionFilter().catch(error, host);
  expect(response.status).toHaveBeenCalledWith(503);
  expect(response.json).toHaveBeenCalledWith({
    success: false,
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database is busy. Please retry shortly.',
      field: null,
      details: null,
      requestId: 'req_test',
    },
  });
});
