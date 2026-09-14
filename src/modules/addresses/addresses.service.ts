import { HttpStatus, Injectable } from '@nestjs/common';
import type { Address } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}
  list(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }
  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`addresses:${userId}`}, 0))::text`;
      const count = await tx.address.count({ where: { userId } });
      const makeDefault = dto.isDefault === true || count === 0;
      if (makeDefault)
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({
        data: {
          userId,
          label: dto.label,
          fullAddress: dto.fullAddress,
          postalCode: dto.postalCode,
          isDefault: makeDefault,
        },
      });
    });
  }
  async update(userId: string, id: string, dto: UpdateAddressDto): Promise<Address> {
    await this.requireAddress(userId, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`addresses:${userId}`}, 0))::text`;
      if (dto.isDefault)
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id, userId }, data: dto });
    });
  }
  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`addresses:${userId}`}, 0))::text`;
      const address = await tx.address.findFirst({ where: { id, userId } });
      if (!address)
        throw new BusinessException(ErrorCode.NOT_FOUND, 'Address not found', HttpStatus.NOT_FOUND);
      await tx.address.delete({ where: { id, userId } });
      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return { deleted: true };
  }
  private async requireAddress(userId: string, id: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address)
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Address not found', HttpStatus.NOT_FOUND);
    return address;
  }
}
