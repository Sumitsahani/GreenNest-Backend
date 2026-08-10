import { HttpStatus, Injectable } from '@nestjs/common';
import type { RewardRedemption, RewardTransaction } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';

const catalog = [
  {
    id: 'free-delivery',
    title: 'Free delivery',
    detail: 'On your next plant order',
    pointsCost: 300,
  },
  { id: 'order-50', title: '₹50 off', detail: 'On orders above ₹499', pointsCost: 500 },
  {
    id: 'service-100',
    title: '₹100 service credit',
    detail: 'For any gardener booking',
    pointsCost: 1000,
  },
  {
    id: 'care-kit',
    title: 'Plant care kit',
    detail: 'Delivered to your doorstep',
    pointsCost: 1500,
  },
] as const;

export interface RewardsSummary {
  balance: number;
  rupeeValue: number;
  catalog: typeof catalog;
  transactions: RewardTransaction[];
  redemptions: RewardRedemption[];
}

export type RewardRedemptionResult = RewardRedemption & { balance: number };

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string): Promise<RewardsSummary> {
    const [aggregate, transactions, redemptions] = await Promise.all([
      this.prisma.rewardTransaction.aggregate({ where: { userId }, _sum: { points: true } }),
      this.prisma.rewardTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.rewardRedemption.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    const balance = aggregate._sum.points ?? 0;
    return { balance, rupeeValue: Math.floor(balance / 10), catalog, transactions, redemptions };
  }

  async redeem(userId: string, rewardId: string): Promise<RewardRedemptionResult> {
    const reward = catalog.find((item) => item.id === rewardId);
    if (!reward)
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Reward not found', HttpStatus.NOT_FOUND);
    return this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.rewardTransaction.aggregate({
        where: { userId },
        _sum: { points: true },
      });
      const balance = aggregate._sum.points ?? 0;
      if (balance < reward.pointsCost)
        throw new BusinessException(
          ErrorCode.VALIDATION_ERROR,
          `You need ${reward.pointsCost - balance} more points`,
          HttpStatus.CONFLICT,
        );
      const redemption = await tx.rewardRedemption.create({
        data: {
          userId,
          rewardId: reward.id,
          title: reward.title,
          pointsCost: reward.pointsCost,
          code: `GREEN-${Date.now().toString(36).toUpperCase()}`,
        },
      });
      await tx.rewardTransaction.create({
        data: {
          userId,
          points: -reward.pointsCost,
          type: 'REDEMPTION',
          title: `Redeemed: ${reward.title}`,
          referenceId: redemption.id,
        },
      });
      return { ...redemption, balance: balance - reward.pointsCost };
    });
  }
}
