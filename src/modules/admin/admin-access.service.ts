import { ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import type { AdminStaff } from '@prisma/client';
import { permits, permissionsFor } from './admin.policy';

@Injectable()
export class AdminAccessService {
  constructor(private readonly db: PrismaService) {}
  async require(user: AuthenticatedUser, permission?: string): Promise<AdminStaff> {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Staff access is required.');
    const staff = await this.db.adminStaff.findUnique({ where: { userId: user.id } });
    if (
      !staff?.active ||
      !permissionsFor(staff.role).length ||
      (permission && !permits(staff.role, permission))
    )
      throw new ForbiddenException('You do not have permission for this action.');
    return staff;
  }
}
@Global()
@Module({ providers: [AdminAccessService], exports: [AdminAccessService] })
export class AdminAccessModule {}
