import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type SpaceDesign } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { buildDesignScene, designError } from './design-scene';
import type { CreateDesignDto } from './dto/designs.dto';

@Injectable()
export class SpaceDesignsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownedSpace(
    userId: string,
    spaceId: string,
  ): Promise<Prisma.SpaceGetPayload<{ include: { scene: true } }>> {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, userId },
      include: { scene: true },
    });
    if (!space)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Saved space not found',
        HttpStatus.NOT_FOUND,
      );
    return space;
  }

  async create(userId: string, spaceId: string, dto: CreateDesignDto): Promise<SpaceDesign> {
    const space = await this.ownedSpace(userId, spaceId);
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          title: dto.title,
          style: dto.style,
          carePreference: dto.carePreference,
          ids: [...dto.recommendationIds].sort(),
        }),
      )
      .digest('hex');
    const where = { spaceId_requestId: { spaceId, requestId: dto.requestId } };
    const existing = await this.prisma.spaceDesign.findUnique({ where });
    if (existing) {
      if (existing.requestHash !== requestHash)
        designError('Start a new save for this changed design.');
      return existing;
    }
    if (space.analysisStatus !== 'COMPLETED' || !space.scene)
      designError('Finish space analysis before creating a design.');
    const matches = await this.prisma.spacePlantRecommendation.findMany({
      where: {
        id: { in: dto.recommendationIds },
        spaceId,
        style: dto.style,
        carePreference: dto.carePreference,
      },
      include: { product: true },
      orderBy: { rank: 'asc' },
    });
    if (matches.length !== dto.recommendationIds.length || !matches.length) {
      designError('Plant suggestions have changed. Refresh them and select plants again.');
    }
    const scene = buildDesignScene(space.scene, matches);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const saved = await tx.spaceDesign.create({
          data: {
            spaceId,
            requestId: dto.requestId,
            requestHash,
            title: dto.title,
            style: dto.style,
            carePreference: dto.carePreference,
            scene,
          },
        });
        await tx.engagementEvent.create({
          data: {
            userId,
            name: 'space_design_saved',
            properties: {
              spaceId,
              designId: saved.id,
              style: dto.style,
              plantCount: matches.length,
            },
          },
        });
        return saved;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const saved = await this.prisma.spaceDesign.findUnique({ where });
        if (saved?.requestHash === requestHash) return saved;
        designError('Start a new save for this changed design.');
      }
      throw error;
    }
  }

  async list(
    userId: string,
    spaceId: string,
  ): Promise<
    Pick<SpaceDesign, 'id' | 'spaceId' | 'title' | 'style' | 'carePreference' | 'createdAt'>[]
  > {
    await this.ownedSpace(userId, spaceId);
    return this.prisma.spaceDesign.findMany({
      where: { spaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        spaceId: true,
        title: true,
        style: true,
        carePreference: true,
        createdAt: true,
      },
    });
  }

  async detail(userId: string, spaceId: string, id: string): Promise<SpaceDesign> {
    const saved = await this.prisma.spaceDesign.findFirst({
      where: { id, spaceId, space: { userId } },
    });
    if (!saved)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Saved design not found',
        HttpStatus.NOT_FOUND,
      );
    return saved;
  }
}
