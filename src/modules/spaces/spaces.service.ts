import { HttpStatus, Injectable } from '@nestjs/common';
import { SpaceAnalysisStatus, type Space, type SpaceScene } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { AiResponseService } from '../ai/ai-response.service';
import type { AnalyzeSpaceDto } from './dto/spaces.dto';

export type SpaceWithScene = Space & { scene: SpaceScene | null };

@Injectable()
export class SpacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiResponseService,
  ) {}

  async analyze(userId: string, dto: AnalyzeSpaceDto): Promise<SpaceWithScene> {
    this.assertOwnedPhoto(userId, dto.photoPath, dto.imageUrl);
    const space = await this.prisma.space.create({
      data: {
        userId,
        photoPath: dto.photoPath,
        declaredType: dto.declaredType,
      },
    });

    try {
      const result = await this.ai.analyzeSpace(dto.imageUrl, dto.declaredType, dto.language);
      return await this.prisma.$transaction(async (tx) => {
        await tx.spaceScene.create({
          data: {
            spaceId: space.id,
            proportions: result.proportions,
            objects: result.objects,
            surfaces: result.surfaces,
            environment: result.environmentEstimate,
            placementZones: result.placementZones,
            confidence: result.confidence,
            warnings: result.warnings,
            analysisModel: result.analysisModel,
          },
        });
        await tx.engagementEvent.create({
          data: {
            userId,
            name: 'space_analysis_completed',
            properties: {
              spaceId: space.id,
              spaceType: result.spaceType,
              zoneCount: result.placementZones.length,
              confidence: result.confidence,
            },
          },
        });
        return tx.space.update({
          where: { id: space.id },
          data: {
            detectedType: result.spaceType,
            environment: result.environment,
            analysisStatus: SpaceAnalysisStatus.COMPLETED,
            analysisError: null,
          },
          include: { scene: true },
        });
      });
    } catch (error) {
      await this.prisma.space.update({
        where: { id: space.id },
        data: {
          analysisStatus: SpaceAnalysisStatus.FAILED,
          analysisError:
            error instanceof BusinessException ? error.code : ErrorCode.AI_ANALYSIS_FAILED,
        },
      });
      throw error;
    }
  }

  list(userId: string): Promise<SpaceWithScene[]> {
    return this.prisma.space.findMany({
      where: { userId },
      include: { scene: true },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });
  }

  async detail(userId: string, id: string): Promise<SpaceWithScene> {
    const space = await this.prisma.space.findFirst({
      where: { id, userId },
      include: { scene: true },
    });
    if (!space) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Saved space not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return space;
  }

  private assertOwnedPhoto(userId: string, photoPath: string, imageUrl: string): void {
    const requiredPrefix = `${userId}/spaces/`;
    if (!photoPath.startsWith(requiredPrefix) || photoPath.includes('..')) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        'This space photo does not belong to your account',
        HttpStatus.FORBIDDEN,
      );
    }
    let url: URL;
    let supabaseHost: string;
    try {
      url = new URL(imageUrl);
      supabaseHost = new URL(process.env.SUPABASE_URL ?? '').hostname;
    } catch {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Use a valid signed GreenNest space photo URL',
        HttpStatus.BAD_REQUEST,
      );
    }
    const signedMarker = '/storage/v1/object/sign/space-photos/';
    const markerIndex = url.pathname.indexOf(signedMarker);
    let signedPath = '';
    try {
      signedPath =
        markerIndex >= 0
          ? decodeURIComponent(url.pathname.slice(markerIndex + signedMarker.length))
          : '';
    } catch {
      signedPath = '';
    }
    if (
      url.protocol !== 'https:' ||
      url.hostname !== supabaseHost ||
      signedPath !== photoPath ||
      !url.searchParams.has('token')
    ) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Use a valid signed GreenNest space photo URL',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
