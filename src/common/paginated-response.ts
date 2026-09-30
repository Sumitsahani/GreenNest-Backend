import { ApiOkResponse } from '@nestjs/swagger';
export const ApiPaginatedResponse = (): MethodDecorator =>
  ApiOkResponse({
    description: 'A filtered page. page starts at 1; limit defaults to 20 and cannot exceed 100.',
    schema: {
      type: 'object',
      required: ['success', 'data'],
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          required: ['items', 'meta'],
          properties: {
            items: { type: 'array', items: { type: 'object', additionalProperties: true } },
            meta: {
              type: 'object',
              required: ['page', 'limit', 'total', 'totalPages', 'hasNextPage', 'hasPreviousPage'],
              properties: {
                page: { type: 'integer', minimum: 1 },
                limit: { type: 'integer', minimum: 1, maximum: 100 },
                total: { type: 'integer', minimum: 0 },
                totalPages: { type: 'integer', minimum: 0 },
                hasNextPage: { type: 'boolean' },
                hasPreviousPage: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  });
