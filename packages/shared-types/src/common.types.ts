export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface PaginatedApiSuccess<T> extends ApiSuccess<T[]> {
  meta: { page: number; limit: number; total: number; totalPages: number };
}
