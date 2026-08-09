import { HttpStatus, Injectable } from '@nestjs/common';
import type { Address } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}
  list(userId: string): Promise<Address[]> { return this.prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }); }
  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    const count = await this.prisma.address.count({ where: { userId } });
    return this.prisma.$transaction(async (tx) => {
      const makeDefault = dto.isDefault === true || count === 0;
      if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({ data: { userId, label: dto.label, fullAddress: dto.fullAddress, postalCode: dto.postalCode, isDefault: makeDefault } });
    });
  }
  async update(userId: string, id: string, dto: UpdateAddressDto): Promise<Address> {
    await this.requireAddress(userId, id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: dto });
    });
  }
  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const address = await this.requireAddress(userId, id);
    await this.prisma.address.delete({ where: { id } });
    if (address.isDefault) { const next = await this.prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }); if (next) await this.prisma.address.update({ where: { id: next.id }, data: { isDefault: true } }); }
    return { deleted: true };
  }
  private async requireAddress(userId: string, id: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) throw new BusinessException(ErrorCode.NOT_FOUND, 'Address not found', HttpStatus.NOT_FOUND);
    return address;
  }
}
