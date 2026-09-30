import { paginate, dateRange, listDirection, type PageResult } from '../../common/pagination';
import { ServiceListQuery } from '../../common/dto/list-query.dto';
import type { Prisma } from '@prisma/client';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { CatalogService, type ProductResponse } from '../catalog/catalog.service';

@Injectable()
export class WishlistService {
  listPage(userId: string, query: ServiceListQuery): Promise<PageResult<ProductResponse>> {
    const where: Prisma.WishlistItemWhereInput = {
      userId,
      createdAt: dateRange(query),
      product: {
        active: true,
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
        ...(query.category ? { category: { slug: query.category } } : {}),
      },
    };
    return paginate(
      query,
      async (skip, take) =>
        (
          await this.prisma.wishlistItem.findMany({
            where,
            skip,
            take,
            orderBy: [{ createdAt: listDirection(query) }, { id: 'asc' }],
            include: { product: { include: { category: { select: { name: true, slug: true } } } } },
          })
        ).map((row) => this.catalog.mapProduct(row.product)),
      () => this.prisma.wishlistItem.count({ where }),
    );
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}
  async list(userId: string): Promise<ProductResponse[]> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { productId: true },
    });
    return Promise.all(rows.map((row) => this.catalog.product(row.productId)));
  }
  async add(userId: string, productId: string): Promise<{ saved: true }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, active: true },
    });
    if (!product?.active)
      throw new BusinessException(
        ErrorCode.PRODUCT_NOT_FOUND,
        'Product not found',
        HttpStatus.NOT_FOUND,
      );
    await this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: {},
      create: { userId, productId },
    });
    return { saved: true };
  }
  async remove(userId: string, productId: string): Promise<{ saved: false }> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, productId } });
    return { saved: false };
  }
}
