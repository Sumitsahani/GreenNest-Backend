/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PlantEventType } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { PlantIntelligenceService } from './plant-intelligence.service';

describe('plant rescue checkpoints', () => {
  it('creates day 3, 7 and 14 checkpoints for a high-risk treatment', async () => {
    const occurredAt = new Date('2026-09-07T06:00:00Z');
    const createMany = jest.fn();
    const tx = {
      plantEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1', occurredAt }) },
      recoveryCheckpoint: { createMany },
    };
    const prisma = {
      gardenPlant: { findFirst: jest.fn().mockResolvedValue({ id: 'plant-1', health: 42 }) },
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PlantIntelligenceService(prisma, {} as never, {} as never, {} as never);
    await service.recordEvent('user-1', 'plant-1', {
      type: PlantEventType.TREATMENT_APPLIED,
      note: 'Treatment applied',
    });
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ dayOffset: 3 }),
        expect.objectContaining({ dayOffset: 7 }),
        expect.objectContaining({ dayOffset: 14 }),
      ]),
      skipDuplicates: true,
    });
  });
});
