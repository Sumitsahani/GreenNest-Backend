import {
  MatchConfidence,
  SpaceCarePreference,
  SpaceDesignStyle,
  type Product,
} from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import type { UserGardeningProfileService } from '../intelligence/user-gardening-profile.service';
import { PlantMatchingService } from './plant-matching.service';

describe('PlantMatchingService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const spaceId = '22222222-2222-4222-8222-222222222222';
  const dto = {
    style: SpaceDesignStyle.MINIMAL,
    carePreference: SpaceCarePreference.EASY,
    language: 'ENGLISH' as const,
  };
  const zone = {
    zoneId: 'zone-1',
    type: 'SHELF',
    location: 'LEFT_CORNER',
    approximateSize: 'SMALL',
    light: 'LOW',
    available: true,
    confidence: 0.9,
  };

  const product = (overrides: Partial<Product>): Product =>
    ({
      id: 'product-1',
      slug: 'golden-pothos',
      name: 'Golden Pothos',
      scientificName: 'Epipremnum aureum',
      description: 'Resilient trailing plant',
      price: 449,
      salePrice: null,
      images: ['/pothos.png'],
      rating: 4.8,
      reviewCount: 1,
      stock: 10,
      petSafe: false,
      height: '25-45 cm',
      light: 'Low to bright indirect',
      water: '7-10 days',
      difficulty: 'Easy',
      featured: true,
      active: true,
      categoryId: 'category-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Product;

  const profile = {
    experienceLevel: 'UNKNOWN',
    totalPlants: 0,
    historicalPlants: [],
    preferences: [],
    carePatterns: [],
    commonProblems: [],
    successfulPatterns: [],
    learnedMistakes: [],
  };

  it('ranks suitable easy-care plants and persists only internal scores', async () => {
    const pothos = product({});
    const palm = product({
      id: 'product-2',
      slug: 'areca-palm',
      name: 'Areca Palm',
      height: '90-120 cm',
      light: 'Bright indirect',
      difficulty: 'Medium',
    });
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const saved = [
      {
        id: 'match-1',
        spaceId,
        productId: pothos.id,
        zoneId: zone.zoneId,
        style: dto.style,
        carePreference: dto.carePreference,
        rank: 1,
        designScore: 78,
        environmentScore: 92,
        lightScore: 96,
        spaceScore: 96,
        careScore: 100,
        preferenceScore: 70,
        overallScore: 93,
        confidence: MatchConfidence.HIGH,
        reasonEnglish: 'Good fit.',
        reasonHindi: 'सही पौधा।',
        cautionEnglish: null,
        cautionHindi: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        product: pothos,
      },
    ];
    const tx = {
      spacePlantRecommendation: {
        deleteMany: jest.fn(),
        createMany,
        findMany: jest.fn().mockResolvedValue(saved),
      },
      engagementEvent: { create: jest.fn() },
    };
    const prisma = {
      space: {
        findFirst: jest.fn().mockResolvedValue({
          id: spaceId,
          analysisStatus: 'COMPLETED',
          environment: 'INDOOR',
          scene: { placementZones: [zone] },
        }),
      },
      product: { findMany: jest.fn().mockResolvedValue([palm, pothos]) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const profiles = {
      build: jest.fn().mockResolvedValue(profile),
    } as unknown as UserGardeningProfileService;
    const service = new PlantMatchingService(prisma, profiles);

    const result = await service.recommend(userId, spaceId, dto);

    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ productId: pothos.id, rank: 1 }) as unknown,
      ]) as unknown,
    });
    expect(result.recommendations[0]).toMatchObject({
      product: { id: pothos.id },
      confidence: MatchConfidence.HIGH,
    });
    expect(result.recommendations[0]).not.toHaveProperty('overallScore');
  });

  it('does not recommend plants when analysis found no available zone', async () => {
    const prisma = {
      space: {
        findFirst: jest.fn().mockResolvedValue({
          id: spaceId,
          analysisStatus: 'COMPLETED',
          environment: 'INDOOR',
          scene: { placementZones: [{ ...zone, available: false }] },
        }),
      },
    } as unknown as PrismaService;
    const build = jest.fn();
    const profiles = { build } as unknown as UserGardeningProfileService;
    const service = new PlantMatchingService(prisma, profiles);

    await expect(service.recommend(userId, spaceId, dto)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(build).not.toHaveBeenCalled();
  });
});
