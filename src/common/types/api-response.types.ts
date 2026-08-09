import type { ErrorCode } from '../constants/error-code';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  field: string | null;
  details: unknown;
  requestId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}
