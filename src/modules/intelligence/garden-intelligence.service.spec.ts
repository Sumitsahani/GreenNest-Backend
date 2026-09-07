/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/unbound-method */
import { NextBestActionService } from './next-best-action.service';
import { GardenIntelligenceService } from './garden-intelligence.service';
import type { PrismaService } from '../../database/prisma.service';

describe('GardenIntelligenceService', () => {
  const now = new Date('2026-09-07T06:00:00Z');
  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());
  const plant = (index: number, due = true) => ({
    id: `plant-${index}`,
    name: `Plant ${index}`,
    species: null,
    location: index % 2 ? 'Balcony' : 'Living room',
    health: 90,
    lastWateredAt: due ? new Date('2026-08-29') : new Date('2026-09-06'),
    nextWateringAt: due ? new Date('2026-09-06') : new Date('2026-09-14'),
    wateringDays: 7,
    recommendations: [],
    memories: [],
    outcomes: [],
    photos: [],
    recoveryCheckpoints: [],
  });
  const setup = (plants: ReturnType<typeof plant>[]) => {
    const prisma = {
      gardenPlant: { findMany: jest.fn().mockResolvedValue(plants) },
      recoveryCheckpoint: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    return { service: new GardenIntelligenceService(prisma, new NextBestActionService()), prisma };
  };
  it.each([1, 5, 20, 50, 100])(
    'aggregates and groups %i due plants without per-plant queries',
    async (count) => {
      const { service, prisma } = setup(Array.from({ length: count }, (_, index) => plant(index)));
      const result = await service.today('user-1');
      expect(result.totalPlants).toBe(count);
      expect(result.attentionCount).toBe(count);
      expect(result.groups.reduce((sum, group) => sum + group.count, 0)).toBe(count);
      expect(prisma.gardenPlant.findMany).toHaveBeenCalledTimes(1);
    },
  );
  it('returns a truthful zero-action state without creating work', async () => {
    const { service } = setup([plant(1, false), plant(2, false), plant(3, false)]);
    const result = await service.today('user-1');
    expect(result.zeroAction).toBe(true);
    expect(result.attentionCount).toBe(0);
    expect(result.headline).toBe('Your garden looks good today.');
  });
});
