import { BadRequestException } from '@nestjs/common';
import type { PaginationQueryDto } from './dto/pagination-query.dto';
import type { ListQueryDto } from './dto/list-query.dto';

export interface PageResult<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
export async function paginate<T>(
  query: PaginationQueryDto,
  read: (skip: number, take: number) => Promise<T[]>,
  count: () => Promise<number>,
): Promise<PageResult<T>> {
  const [items, total] = await Promise.all([
    read((query.page - 1) * query.limit, query.limit),
    count(),
  ]);
  const totalPages = Math.ceil(total / query.limit);
  return {
    items,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    },
  };
}
export function dateRange(
  query: Pick<ListQueryDto, 'from' | 'to'>,
): { gte?: Date; lte?: Date } | undefined {
  if (!query.from && !query.to) return undefined;
  const gte = query.from ? new Date(query.from) : undefined;
  const lte = query.to
    ? new Date(query.to.length === 10 ? `${query.to}T23:59:59.999Z` : query.to)
    : undefined;
  if (gte && lte && gte > lte) throw new BadRequestException('from must be before or equal to to');
  return { gte, lte };
}
export const listDirection = (query: Pick<ListQueryDto, 'sort'>): 'asc' | 'desc' =>
  query.sort === 'oldest' ? 'asc' : 'desc';
