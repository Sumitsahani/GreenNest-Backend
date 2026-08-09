export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RESOURCE_ALREADY_EXISTS'
  | 'INTERNAL_ERROR';

export interface ApiError {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    field: string | null;
    details: unknown;
    requestId: string;
  };
}
