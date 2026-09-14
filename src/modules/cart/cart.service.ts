import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { CatalogService, type ProductResponse } from '../catalog/catalog.service';

export interface CartLineResponse {
  id: string;
  quantity: number;
  lineTotal: number;
  product: ProductResponse;
}
export interface CartResponse {
  items: CartLineResponse[];
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}
  async get(userId: string): Promise<CartResponse> {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { product: { include: { category: { select: { name: true, slug: true } } } } },
    });
    const items = rows.map((row) => ({
      id: row.id,
      quantity: row.quantity,
      lineTotal: Number(row.product.price) * row.quantity,
      product: this.catalog.mapProduct(row.product),
    }));
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const deliveryFee = subtotal === 0 || subtotal >= 999 ? 0 : 79;
    return {
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
    };
  }
  async add(userId: string, productId: string, quantity: number): Promise<CartResponse> {
    return this.change(userId, async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { stock: true, active: true },
      });
      if (!product?.active)
        throw new BusinessException(
          ErrorCode.PRODUCT_NOT_FOUND,
          'Product not found',
          HttpStatus.NOT_FOUND,
        );
      const existing = await tx.cartItem.findUnique({
        where: { userId_productId: { userId, productId } },
      });
      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      if (nextQuantity > product.stock)
        throw new BusinessException(
          ErrorCode.PRODUCT_OUT_OF_STOCK,
          'Requested quantity is not available',
          HttpStatus.CONFLICT,
          { field: 'quantity', details: { available: product.stock } },
        );
      await tx.cartItem.upsert({
        where: { userId_productId: { userId, productId } },
        update: { quantity: nextQuantity },
        create: { userId, productId, quantity },
      });
    });
  }
  async update(userId: string, itemId: string, quantity: number): Promise<CartResponse> {
    return this.change(userId, async (tx) => {
      const item = await tx.cartItem.findFirst({
        where: { id: itemId, userId },
        include: { product: { select: { stock: true, active: true } } },
      });
      if (!item)
        throw new BusinessException(
          ErrorCode.CART_ITEM_NOT_FOUND,
          'Cart item not found',
          HttpStatus.NOT_FOUND,
        );
      if (!item.product.active || quantity > item.product.stock)
        throw new BusinessException(
          ErrorCode.PRODUCT_OUT_OF_STOCK,
          'Requested quantity is not available',
          HttpStatus.CONFLICT,
          { field: 'quantity', details: { available: item.product.stock } },
        );
      await tx.cartItem.update({ where: { id: item.id, userId }, data: { quantity } });
    });
  }
  async remove(userId: string, itemId: string): Promise<CartResponse> {
    return this.change(userId, async (tx) => {
      const result = await tx.cartItem.deleteMany({ where: { id: itemId, userId } });
      if (!result.count)
        throw new BusinessException(
          ErrorCode.CART_ITEM_NOT_FOUND,
          'Cart item not found',
          HttpStatus.NOT_FOUND,
        );
    });
  }
  async clear(userId: string): Promise<CartResponse> {
    return this.change(userId, (tx) => tx.cartItem.deleteMany({ where: { userId } }));
  }
  private async change(
    userId: string,
    write: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<CartResponse> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout:${userId}`}, 0))::text`;
      await write(tx);
    });
    return this.get(userId);
  }
}
