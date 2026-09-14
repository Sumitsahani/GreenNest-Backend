import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { CreateOrderDto } from './dto/order.dto';

export interface OrderResponse {
  id: string;
  orderNumber: string;
  status: string;
  addressLabel: string;
  deliveryAddress: string;
  postalCode: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    image: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
}
type OrderRecord = Omit<
  OrderResponse,
  'subtotal' | 'deliveryFee' | 'total' | 'createdAt' | 'items'
> & {
  subtotal: unknown;
  deliveryFee: unknown;
  total: unknown;
  createdAt: Date;
  items: Array<
    Omit<OrderResponse['items'][number], 'unitPrice' | 'lineTotal'> & {
      unitPrice: unknown;
      lineTotal: unknown;
    }
  >;
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}
  async create(userId: string, dto: CreateOrderDto): Promise<OrderResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout:${userId}`}, 0))::text`;
        if (dto.requestId) {
          const existing = await tx.order.findFirst({
            where: { userId, requestId: dto.requestId },
            include: { items: true },
          });
          if (existing) return this.map(existing);
        }
        const address = await tx.address.findFirst({ where: { id: dto.addressId, userId } });
        if (!address)
          throw new BusinessException(
            ErrorCode.NOT_FOUND,
            'Delivery address not found',
            HttpStatus.NOT_FOUND,
          );
        const cart = await tx.cartItem.findMany({ where: { userId }, include: { product: true } });
        if (!cart.length)
          throw new BusinessException(
            ErrorCode.CART_EMPTY,
            'Your cart is empty',
            HttpStatus.CONFLICT,
          );
        for (const item of cart)
          if (!item.product.active || item.quantity > item.product.stock)
            throw new BusinessException(
              ErrorCode.PRODUCT_OUT_OF_STOCK,
              `${item.product.name} is not available in the requested quantity`,
              HttpStatus.CONFLICT,
            );
        const subtotal = cart.reduce(
          (sum, item) => sum + Number(item.product.price) * item.quantity,
          0,
        );
        const deliveryFee = subtotal >= 999 ? 0 : 79;
        const order = await tx.order.create({
          data: {
            orderNumber: `GN-${randomUUID()}`,
            requestId: dto.requestId,
            userId,
            addressLabel: address.label,
            deliveryAddress: address.fullAddress,
            postalCode: address.postalCode,
            subtotal,
            deliveryFee,
            total: subtotal + deliveryFee,
            paymentMethod: dto.paymentMethod,
            items: {
              create: cart.map((item) => ({
                productId: item.productId,
                productName: item.product.name,
                image: item.product.images[0],
                unitPrice: item.product.price,
                quantity: item.quantity,
                lineTotal: Number(item.product.price) * item.quantity,
              })),
            },
          },
          include: { items: true },
        });
        const earnedPoints = Math.floor(subtotal / 10);
        if (earnedPoints > 0)
          await tx.rewardTransaction.create({
            data: {
              userId,
              points: earnedPoints,
              type: 'ORDER_EARN',
              title: `Order ${order.orderNumber}`,
              referenceId: order.id,
            },
          });
        for (const item of [...cart].sort((a, b) => a.productId.localeCompare(b.productId))) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.productId,
              active: true,
              stock: { gte: item.quantity },
              price: item.product.price,
            },
            data: { stock: { decrement: item.quantity } },
          });
          if (updated.count !== 1)
            throw new BusinessException(
              ErrorCode.PRODUCT_OUT_OF_STOCK,
              'Product availability or price changed. Refresh your cart.',
              HttpStatus.CONFLICT,
            );
        }
        await tx.cartItem.deleteMany({ where: { userId } });
        return this.map(order);
      },
      { timeout: 15_000 },
    );
  }
  async list(userId: string): Promise<OrderResponse[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return orders.map((order) => this.map(order));
  }
  async detail(userId: string, id: string): Promise<OrderResponse> {
    const order = await this.prisma.order.findFirst({
      where: { userId, OR: [{ id: this.uuidOrImpossible(id) }, { orderNumber: id }] },
      include: { items: true },
    });
    if (!order)
      throw new BusinessException(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    return this.map(order);
  }
  private uuidOrImpossible(value: string): string {
    return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
      ? value
      : '00000000-0000-0000-0000-000000000000';
  }
  private map(order: OrderRecord): OrderResponse {
    return {
      ...order,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      total: Number(order.total),
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
      })),
    };
  }
}
