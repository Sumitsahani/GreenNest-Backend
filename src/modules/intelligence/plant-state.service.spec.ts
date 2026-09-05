import { PlantStateService } from './plant-state.service';
import type { PrismaService } from '../../database/prisma.service';

describe('PlantStateService ownership', () => {
  it('always scopes plant state reads to both plant and authenticated user', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      gardenPlant: { findFirst },
    } as unknown as PrismaService;
    const service = new PlantStateService(prisma);

    await expect(service.getPlantState('plant-a', 'user-b')).rejects.toThrow(
      'Garden plant not found',
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'plant-a', userId: 'user-b' } }),
    );
  });

  it('derives current histories and the latest watering event without duplicating state', async () => {
    const wateredAt = new Date('2026-09-04T06:00:00.000Z');
    const findFirst = jest.fn().mockResolvedValue({
      id: 'plant-a',
      userId: 'user-a',
      name: 'Money Plant',
      species: 'Epipremnum aureum',
      category: 'Indoor foliage',
      source: 'AI_IDENTIFICATION',
      createdAt: new Date('2026-08-01T06:00:00.000Z'),
      lifecycleStatus: 'ACTIVE',
      location: 'Balcony',
      idealSunlight: 'Bright indirect',
      placementAdvice: 'Near a window',
      health: 88,
      lastWateredAt: null,
      nextWateringAt: new Date('2026-09-10T06:00:00.000Z'),
      wateringDays: 6,
      careEvents: [
        { id: 'water-a', type: 'WATER', caredAt: wateredAt },
        { id: 'feed-a', type: 'FERTILIZE', caredAt: new Date('2026-09-01T06:00:00.000Z') },
      ],
      events: [
        { id: 'move-a', type: 'MOVED' },
        { id: 'symptom-a', type: 'SYMPTOM_REPORTED' },
      ],
      reminders: [],
      photos: [],
      outcomes: [],
      recommendations: [],
      memories: [],
    });
    const prisma = { gardenPlant: { findFirst } } as unknown as PrismaService;
    const service = new PlantStateService(prisma);

    const state = await service.getPlantState('plant-a', 'user-a');

    expect(state.lastWateredAt).toEqual(wateredAt);
    expect(state.wateringHistory).toHaveLength(1);
    expect(state.fertilizingHistory).toHaveLength(1);
    expect(state.movementHistory).toHaveLength(1);
    expect(state.symptoms).toHaveLength(1);
  });
});
