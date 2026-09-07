/* eslint-disable @typescript-eslint/unbound-method */
import type { PrismaService } from '../../database/prisma.service';
import type { GardenService } from '../garden/garden.service';
import { AiCareActionService, parseCareDate } from './ai-care-action.service';

describe('AiCareActionService', () => {
  it('parses natural calendar dates', () => {
    const now = new Date('2026-09-06T10:00:00+05:30');
    expect(parseCareDate('set it for 10 September 2026', 'FUTURE', now)).toEqual(
      new Date(2026, 8, 10, 9, 0, 0, 0),
    );
    expect(parseCareDate('maine kal pani diya', 'PAST', now)?.getDate()).toBe(5);
  });

  it('records a watering statement and returns sync metadata', async () => {
    const prisma = {
      gardenPlant: {
        findMany: jest.fn().mockResolvedValue([{ id: 'plant-1', name: 'Echeveria' }]),
      },
    } as unknown as PrismaService;
    const garden = {
      recordWateringAt: jest.fn().mockResolvedValue({
        nextWateringAt: new Date('2026-09-13T09:00:00.000Z'),
      }),
    } as unknown as GardenService;
    const service = new AiCareActionService(prisma, garden);

    const result = await service.apply('user-1', undefined, 'I watered it today');

    expect(garden.recordWateringAt).toHaveBeenCalledWith(
      'user-1',
      'plant-1',
      expect.any(Date),
      'Watering recorded from Plant Buddy chat',
    );
    expect(result?.update).toEqual(
      expect.objectContaining({ type: 'WATERED', plantId: 'plant-1' }),
    );
  });

  it('reschedules a named plant and updates reminder metadata', async () => {
    const prisma = {
      gardenPlant: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'plant-1', name: 'Echeveria' },
          { id: 'plant-2', name: 'Snake Plant' },
        ]),
      },
    } as unknown as PrismaService;
    const garden = {
      rescheduleWatering: jest.fn().mockResolvedValue({
        nextWateringAt: new Date('2030-12-20T03:30:00.000Z'),
      }),
    } as unknown as GardenService;
    const service = new AiCareActionService(prisma, garden);

    const result = await service.apply(
      'user-1',
      undefined,
      'Echeveria next watering date 20 December 2030 kar do',
    );

    expect(garden.rescheduleWatering).toHaveBeenCalledWith(
      'user-1',
      'plant-1',
      expect.any(Date),
      'Watering date changed from Plant Buddy chat',
    );
    expect(result?.update?.type).toBe('WATERING_RESCHEDULED');
  });
});
