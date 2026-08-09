import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { CatalogService, type ProductResponse } from '../catalog/catalog.service';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService, private readonly catalog: CatalogService) {}
  async list(userId: string): Promise<ProductResponse[]> {
    const rows = await this.prisma.wishlistItem.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { productId: true } });
    return Promise.all(rows.map((row) => this.catalog.product(row.productId)));
  }
  async add(userId: string, productId: string): Promise<{ saved: true }> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, active: true } });
    if (!product?.active) throw new BusinessException(ErrorCode.PRODUCT_NOT_FOUND, 'Product not found', HttpStatus.NOT_FOUND);
    await this.prisma.wishlistItem.upsert({ where: { userId_productId: { userId, productId } }, update: {}, create: { userId, productId } });
    return { saved: true };
  }
  async remove(userId: string, productId: string): Promise<{ saved: false }> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, productId } });
    return { saved: false };
  }
}
