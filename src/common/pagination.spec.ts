import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { paginate, dateRange } from './pagination';
import { ProductQueryDto } from '../modules/catalog/dto/catalog-query.dto';
describe('Pagination boundaries', () => {
  it('visits every record once and returns an empty page past the end', async () => {
    const rows = Array.from({ length: 41 }, (_, id) => ({ id }));
    const read = (skip: number, take: number): Promise<{ id: number }[]> =>
      Promise.resolve(rows.slice(skip, skip + take));
    const count = (): Promise<number> => Promise.resolve(rows.length);
    const pages = await Promise.all(
      [1, 2, 3, 4].map((page) => paginate({ page, limit: 20 }, read, count)),
    );
    expect(pages.map((page) => page.items.length)).toEqual([20, 20, 1, 0]);
    expect(pages.flatMap((page) => page.items)).toEqual(rows);
    expect(pages[2]!.meta.hasNextPage).toBe(false);
  });
  it('handles an empty collection without a next page', async () => {
    expect(
      (
        await paginate(
          { page: 1, limit: 20 },
          () => Promise.resolve([]),
          () => Promise.resolve(0),
        )
      ).meta,
    ).toMatchObject({ total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false });
  });
  it('does not alter an explicit timestamp upper bound', () => {
    expect(dateRange({ to: '2026-09-01T06:00:00Z' })?.lte).toEqual(
      new Date('2026-09-01T06:00:00Z'),
    );
  });
  it('parses featured=false and zero price without truthy coercion', async () => {
    const query = plainToInstance(ProductQueryDto, {
      featured: 'false',
      minPrice: '0',
      maxPrice: '0',
    });
    expect(await validate(query)).toEqual([]);
    expect(query.featured).toBe(false);
    expect(query.maxPrice).toBe(0);
    expect(await validate(plainToInstance(ProductQueryDto, { featured: 'bad' }))).not.toEqual([]);
  });
});
