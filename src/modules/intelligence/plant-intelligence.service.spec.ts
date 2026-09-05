/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { PrismaService } from '../../database/prisma.service';
import type { NextBestActionService } from './next-best-action.service';
import { PlantIntelligenceService } from './plant-intelligence.service';
import type { PlantStateService } from './plant-state.service';
import type { UserGardeningProfileService } from './user-gardening-profile.service';

describe('PlantIntelligenceService new-plant cross-reference', () => {
  const setup = (
    sameSpecies: { id: string }[],
    similarSpecies: { id: string }[],
  ): { service: PlantIntelligenceService; createMany: jest.Mock } => {
    const createMany = jest.fn().mockResolvedValue({ count: sameSpecies.length + similarSpecies.length });
    const findMany = jest
      .fn()
      .mockResolvedValueOnce(sameSpecies)
      .mockResolvedValueOnce(similarSpecies);
    const prisma = {
      plantEvent: { create: jest.fn().mockResolvedValue({}) },
      plantPhoto: { create: jest.fn().mockResolvedValue({}) },
      gardenPlant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'new-plant',
          userId: 'user-a',
          name: 'Money Plant',
          species: 'Epipremnum aureum',
          category: 'Indoor foliage',
        }),
        findMany,
      },
      plantRelationship: { createMany },
      $transaction: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    const service = new PlantIntelligenceService(
      prisma,
      {} as PlantStateService,
      {} as NextBestActionService,
      {} as UserGardeningProfileService,
    );
    return { service, createMany };
  };

  it('links both same-species and category-similar historical plants', async () => {
    const mocks = setup([{ id: 'same-plant' }], [{ id: 'similar-plant' }]);

    await mocks.service.initializePlant('user-a', 'new-plant', {
      species: 'Epipremnum aureum',
    });

    expect(mocks.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            previousPlantId: 'same-plant',
            type: 'SAME_SPECIES',
          }),
          expect.objectContaining({
            previousPlantId: 'similar-plant',
            type: 'SIMILAR_SPECIES',
          }),
        ]),
      }),
    );
  });

  it('does not fabricate a relationship when no history exists', async () => {
    const mocks = setup([], []);

    await mocks.service.initializePlant('user-a', 'new-plant', {
      species: 'Epipremnum aureum',
    });

    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});
