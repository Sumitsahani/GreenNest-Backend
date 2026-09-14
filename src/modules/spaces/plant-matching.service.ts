import { HttpStatus, Injectable } from '@nestjs/common';
import {
  MatchConfidence,
  PlantOutcomeType,
  SpaceAnalysisStatus,
  SpaceCarePreference,
  SpaceDesignStyle,
  SpaceEnvironment,
  type Product,
  type SpacePlantRecommendation,
} from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { UserGardeningProfileService } from '../intelligence/user-gardening-profile.service';
import type { RecommendPlantsDto } from './dto/spaces.dto';

type LightLevel = 'LOW' | 'MEDIUM' | 'BRIGHT_INDIRECT' | 'DIRECT_SUN' | 'UNKNOWN';
type ZoneSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'UNKNOWN';

interface PlacementZone {
  zoneId: string;
  type: 'FLOOR' | 'TABLE' | 'DESK' | 'SHELF' | 'WINDOW_SIDE' | 'CORNER';
  location: string;
  approximateSize: ZoneSize;
  light: LightLevel;
  available: boolean;
  confidence: number;
}

interface Candidate {
  product: Product;
  zone: PlacementZone;
  designScore: number;
  environmentScore: number;
  lightScore: number;
  spaceScore: number;
  careScore: number;
  preferenceScore: number;
  overallScore: number;
  confidence: MatchConfidence;
  reasonEnglish: string;
  reasonHindi: string;
  cautionEnglish: string | null;
  cautionHindi: string | null;
}

type SavedMatch = SpacePlantRecommendation & { product: Product };

export interface PlantMatchResponse {
  spaceId: string;
  style: SpaceDesignStyle;
  carePreference: SpaceCarePreference;
  generatedAt: string;
  recommendations: Array<{
    id: string;
    rank: number;
    product: {
      id: string;
      slug: string;
      name: string;
      scientificName: string | null;
      image: string | null;
      light: string | null;
      difficulty: string | null;
      petSafe: boolean;
    };
    zone: Pick<PlacementZone, 'zoneId' | 'type' | 'location' | 'light'>;
    confidence: MatchConfidence;
    reason: string;
    caution: string | null;
  }>;
}

@Injectable()
export class PlantMatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: UserGardeningProfileService,
  ) {}

  async recommend(
    userId: string,
    spaceId: string,
    dto: RecommendPlantsDto,
  ): Promise<PlantMatchResponse> {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, userId },
      include: { scene: true },
    });
    if (!space) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Saved space not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (space.analysisStatus !== SpaceAnalysisStatus.COMPLETED || !space.scene) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Finish space analysis before requesting plant matches',
        HttpStatus.CONFLICT,
      );
    }

    const zones = this.readZones(space.scene.placementZones).filter((zone) => zone.available);
    if (!zones.length) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'No safe plant placement zone was found in this space',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const [products, profile] = await Promise.all([
      this.prisma.product.findMany({ where: { active: true }, orderBy: { rating: 'desc' } }),
      this.profiles.build(userId),
    ]);
    if (!products.length) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'No suitable plants are available yet',
        HttpStatus.NOT_FOUND,
      );
    }

    const environment = space.environment ?? SpaceEnvironment.UNKNOWN;
    const candidates = products
      .map(
        (product) =>
          zones
            .map((zone) => this.score(product, zone, environment, dto, profile))
            .sort((a, b) => b.overallScore - a.overallScore)[0],
      )
      .filter((candidate): candidate is Candidate => Boolean(candidate))
      .filter((candidate) => candidate.overallScore >= 60)
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 5);

    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.spacePlantRecommendation.deleteMany({
        where: { spaceId, style: dto.style, carePreference: dto.carePreference },
      });
      await tx.spacePlantRecommendation.createMany({
        data: candidates.map((candidate, index) => ({
          spaceId,
          productId: candidate.product.id,
          zoneId: candidate.zone.zoneId,
          style: dto.style,
          carePreference: dto.carePreference,
          rank: index + 1,
          designScore: candidate.designScore,
          environmentScore: candidate.environmentScore,
          lightScore: candidate.lightScore,
          spaceScore: candidate.spaceScore,
          careScore: candidate.careScore,
          preferenceScore: candidate.preferenceScore,
          overallScore: candidate.overallScore,
          confidence: candidate.confidence,
          reasonEnglish: candidate.reasonEnglish,
          reasonHindi: candidate.reasonHindi,
          cautionEnglish: candidate.cautionEnglish,
          cautionHindi: candidate.cautionHindi,
        })),
      });
      await tx.engagementEvent.create({
        data: {
          userId,
          name: 'space_recommendations_viewed',
          properties: { spaceId, style: dto.style, carePreference: dto.carePreference },
        },
      });
      return tx.spacePlantRecommendation.findMany({
        where: { spaceId, style: dto.style, carePreference: dto.carePreference },
        include: { product: true },
        orderBy: { rank: 'asc' },
      });
    });

    return this.toResponse(spaceId, dto, zones, saved);
  }

  async list(
    userId: string,
    spaceId: string,
    dto: RecommendPlantsDto,
  ): Promise<PlantMatchResponse> {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, userId },
      include: { scene: true },
    });
    if (!space) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Saved space not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const zones = this.readZones(space.scene?.placementZones);
    const saved = await this.prisma.spacePlantRecommendation.findMany({
      where: { spaceId, style: dto.style, carePreference: dto.carePreference },
      include: { product: true },
      orderBy: { rank: 'asc' },
    });
    return this.toResponse(spaceId, dto, zones, saved);
  }

  private toResponse(
    spaceId: string,
    dto: RecommendPlantsDto,
    zones: PlacementZone[],
    saved: SavedMatch[],
  ): PlantMatchResponse {
    const zonesById = new Map(zones.map((zone) => [zone.zoneId, zone]));
    const hindi = dto.language === 'HINDI';
    return {
      spaceId,
      style: dto.style,
      carePreference: dto.carePreference,
      generatedAt: saved[0]?.updatedAt.toISOString() ?? new Date().toISOString(),
      recommendations: saved.flatMap((item) => {
        const zone = zonesById.get(item.zoneId);
        if (!zone) return [];
        return [
          {
            id: item.id,
            rank: item.rank,
            product: {
              id: item.product.id,
              slug: item.product.slug,
              name: item.product.name,
              scientificName: item.product.scientificName,
              image: item.product.images[0] ?? null,
              light: item.product.light,
              difficulty: item.product.difficulty,
              petSafe: item.product.petSafe,
            },
            zone: {
              zoneId: zone.zoneId,
              type: zone.type,
              location: zone.location,
              light: zone.light,
            },
            confidence: item.confidence,
            reason: hindi ? item.reasonHindi : item.reasonEnglish,
            caution: hindi ? item.cautionHindi : item.cautionEnglish,
          },
        ];
      }),
    };
  }

  private score(
    product: Product,
    zone: PlacementZone,
    environment: SpaceEnvironment,
    dto: RecommendPlantsDto,
    profile: Awaited<ReturnType<UserGardeningProfileService['build']>>,
  ): Candidate {
    const lightScore = this.lightScore(product.light, zone.light);
    const spaceScore = this.spaceScore(product.height, zone);
    const careScore = this.careScore(product.difficulty, dto.carePreference);
    const designScore = this.designScore(product, dto.style);
    const environmentScore = this.environmentScore(product, environment, zone.light);
    const preferenceScore = this.preferenceScore(product, profile);
    const overallScore = Math.round(
      lightScore * 0.3 +
        environmentScore * 0.2 +
        spaceScore * 0.15 +
        careScore * 0.15 +
        designScore * 0.1 +
        preferenceScore * 0.1,
    );
    const confidence =
      overallScore >= 82 && zone.confidence >= 0.7
        ? MatchConfidence.HIGH
        : overallScore >= 64
          ? MatchConfidence.MEDIUM
          : MatchConfidence.LOW;
    const poorLight = lightScore < 60;
    const easy = /easy/i.test(product.difficulty ?? '');
    const reasonEnglish = poorLight
      ? `${product.name} fits this ${zone.type.toLowerCase()} area and the selected style, but it would do better with more suitable light.`
      : `${product.name} suits the ${this.readableLight(zone.light)} light at ${this.readableLocation(zone.location)}, fits this ${zone.type.toLowerCase()} area${easy ? ', and is easy to care for' : ''}.`;
    const reasonHindi = poorLight
      ? `${product.name} इस जगह और चुनी गई सजावट में ठीक बैठेगा, लेकिन इसे बेहतर रोशनी वाली जगह चाहिए।`
      : `${product.name} ${this.hindiLight(zone.light)} रोशनी और ${this.hindiLocation(zone.location)} की इस जगह के लिए सही है${easy ? ' और इसकी देखभाल आसान है' : ''}।`;
    const cautionEnglish = poorLight
      ? `It may look good here, but the detected light is not ideal. Consider the next better-lit zone.`
      : null;
    const cautionHindi = poorLight
      ? 'यह यहाँ अच्छा दिख सकता है, लेकिन रोशनी पूरी तरह सही नहीं है। इसे अधिक रोशनी वाली जगह पर रखें।'
      : null;
    return {
      product,
      zone,
      designScore,
      environmentScore,
      lightScore,
      spaceScore,
      careScore,
      preferenceScore,
      overallScore,
      confidence,
      reasonEnglish,
      reasonHindi,
      cautionEnglish,
      cautionHindi,
    };
  }

  private lightScore(requirement: string | null, available: LightLevel): number {
    if (available === 'UNKNOWN' || !requirement) return 62;
    const value = requirement.toLowerCase();
    if (available === 'LOW') return value.includes('low') ? 96 : value.includes('medium') ? 55 : 35;
    if (available === 'MEDIUM') {
      return value.includes('medium') || value.includes('low to bright') ? 94 : 72;
    }
    if (available === 'BRIGHT_INDIRECT') {
      return value.includes('bright indirect') || value.includes('low to bright') ? 98 : 75;
    }
    return value.includes('direct') && !value.includes('indirect') ? 92 : 45;
  }

  private spaceScore(height: string | null, zone: PlacementZone): number {
    const values = (height?.match(/\d+/g) ?? []).map(Number);
    const maxHeight = values.length ? Math.max(...values) : 60;
    if (zone.type === 'SHELF' || zone.type === 'TABLE' || zone.type === 'DESK') {
      return maxHeight <= 50 ? 96 : maxHeight <= 80 ? 68 : 38;
    }
    if (zone.approximateSize === 'SMALL') return maxHeight <= 50 ? 92 : 52;
    if (zone.approximateSize === 'MEDIUM') return maxHeight <= 95 ? 94 : 70;
    return zone.approximateSize === 'LARGE' ? 96 : 72;
  }

  private careScore(difficulty: string | null, preference: SpaceCarePreference): number {
    const easy = /easy/i.test(difficulty ?? '');
    const moderate = /medium|moderate/i.test(difficulty ?? '');
    if (preference === SpaceCarePreference.EASY) return easy ? 100 : moderate ? 62 : 45;
    if (preference === SpaceCarePreference.MODERATE) return easy ? 90 : moderate ? 95 : 62;
    return easy ? 88 : moderate ? 90 : 78;
  }

  private designScore(product: Product, style: SpaceDesignStyle): number {
    const identity = product.slug.toLowerCase();
    if (style === SpaceDesignStyle.JUNGLE) return /palm|pothos|rubber/.test(identity) ? 96 : 76;
    if (style === SpaceDesignStyle.PREMIUM) return /palm|rubber|zz/.test(identity) ? 96 : 78;
    if (style === SpaceDesignStyle.LOW_MAINTENANCE)
      return /easy/i.test(product.difficulty ?? '') ? 100 : 62;
    return /zz|rubber|snake|spider/.test(identity) ? 94 : 78;
  }

  private environmentScore(
    product: Product,
    environment: SpaceEnvironment,
    light: LightLevel,
  ): number {
    if (environment === SpaceEnvironment.UNKNOWN) return 65;
    if (environment === SpaceEnvironment.INDOOR) return 92;
    if (light === 'DIRECT_SUN') return /palm/i.test(product.name) ? 72 : 48;
    return 74;
  }

  private preferenceScore(
    product: Product,
    profile: Awaited<ReturnType<UserGardeningProfileService['build']>>,
  ): number {
    const identity = `${product.name} ${product.scientificName ?? ''}`.toLowerCase();
    let score = 70;
    for (const plant of profile.historicalPlants) {
      const samePlant = [plant.name, plant.species].some(
        (value) => value && identity.includes(value.toLowerCase()),
      );
      if (!samePlant) continue;
      const outcome = plant.outcomes[0]?.outcome;
      if (outcome === PlantOutcomeType.HEALTHY || outcome === PlantOutcomeType.IMPROVED)
        score += 18;
      if (outcome === PlantOutcomeType.DECLINED || outcome === PlantOutcomeType.DIED) score -= 22;
    }
    for (const preference of profile.preferences) {
      if (identity.includes(preference.value.toLowerCase())) score += 12 * preference.confidence;
    }
    return Math.max(30, Math.min(100, Math.round(score)));
  }

  private readZones(value: unknown): PlacementZone[] {
    if (!Array.isArray(value)) return [];
    return value.filter((zone): zone is PlacementZone => {
      if (!zone || typeof zone !== 'object') return false;
      const item = zone as Partial<PlacementZone>;
      return (
        typeof item.zoneId === 'string' &&
        typeof item.type === 'string' &&
        typeof item.location === 'string' &&
        typeof item.light === 'string' &&
        typeof item.available === 'boolean' &&
        typeof item.confidence === 'number'
      );
    });
  }

  private readableLight(light: LightLevel): string {
    return light.toLowerCase().replace(/_/g, ' ');
  }

  private readableLocation(location: string): string {
    return location.toLowerCase().replace(/_/g, ' ');
  }

  private hindiLight(light: LightLevel): string {
    return {
      LOW: 'कम',
      MEDIUM: 'मध्यम',
      BRIGHT_INDIRECT: 'तेज़ लेकिन अप्रत्यक्ष',
      DIRECT_SUN: 'सीधी धूप',
      UNKNOWN: 'अनुमानित',
    }[light];
  }

  private hindiLocation(location: string): string {
    const known: Record<string, string> = {
      LEFT: 'बाईं ओर',
      RIGHT: 'दाईं ओर',
      LEFT_CORNER: 'बाएँ कोने',
      RIGHT_CORNER: 'दाएँ कोने',
      FRONT_LEFT: 'सामने बाईं ओर',
      FRONT_RIGHT: 'सामने दाईं ओर',
      BACK_LEFT: 'पीछे बाईं ओर',
      BACK_RIGHT: 'पीछे दाईं ओर',
      CENTER: 'बीच',
    };
    return known[location] ?? location.toLowerCase().replace(/_/g, ' ');
  }
}
