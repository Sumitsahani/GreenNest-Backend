import type { PrismaService } from '../../database/prisma.service';
import {
  UserGardeningProfileService,
  type UserGardeningProfile,
} from './user-gardening-profile.service';

describe('UserGardeningProfileService', () => {
  const buildWithSkippedCount = async (
    count: number,
  ): Promise<UserGardeningProfile> => {
    const prisma = {
      gardenPlant: { findMany: jest.fn().mockResolvedValue([]) },
      aiUserMemory: { findMany: jest.fn().mockResolvedValue([]) },
      plantRecommendation: { count: jest.fn().mockResolvedValue(count) },
    } as unknown as PrismaService;
    return new UserGardeningProfileService(prisma).build('user-a');
  };

  it('does not infer a stable behavior pattern from one action', async () => {
    const profile = await buildWithSkippedCount(1);

    expect(profile.carePatterns).toEqual([]);
  });

  it('creates a bounded-confidence pattern only after repetition', async () => {
    const profile = await buildWithSkippedCount(3);

    expect(profile.carePatterns).toContainEqual(
      expect.objectContaining({
        key: 'frequently_skips_recommendations',
      }),
    );
    expect(profile.carePatterns[0]!.confidence).toBeLessThanOrEqual(0.9);
  });
});
