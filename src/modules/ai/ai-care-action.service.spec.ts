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
      userSettings: { findUnique: jest.fn().mockResolvedValue({ careTimezone: 'Asia/Kolkata' }) },
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
      undefined,
    );
    expect(result?.update).toEqual(
      expect.objectContaining({ type: 'WATERED', plantId: 'plant-1' }),
    );
  });

  it('reschedules a named plant and updates reminder metadata', async () => {
    const prisma = {
      userSettings: { findUnique: jest.fn().mockResolvedValue({ careTimezone: 'Asia/Kolkata' }) },
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
  it('records an explicit whole-garden statement through the batch service', async () => {
    const prisma = { gardenPlant: { findMany: jest.fn().mockResolvedValue(Array.from({ length: 57 }, (_, i) => ({ id: `p-${i}` }))) } } as unknown as PrismaService;
    const sessions = { complete: jest.fn().mockResolvedValue({}) };
    const service = new AiCareActionService(prisma, {} as never, sessions as never);
    const result = await service.apply('u', undefined, 'I watered all my plants', 'message-id');
    expect(sessions.complete).toHaveBeenCalledWith('u', expect.objectContaining({ clientActionId: 'message-id', plantIds: expect.arrayContaining(['p-56']) }));
    expect(result?.reply).toContain('57');
  });
  it('stores an explicit plant drying correction without inventing watering', async () => {
    const garden = { wateringCorrection: jest.fn() };
    const service = new AiCareActionService({} as never, garden as never);
    await service.apply('u', 'p', 'This plant usually takes 7 days to dry.');
    expect(garden.wateringCorrection).toHaveBeenCalledWith('u', 'p', { dryingDays: 7 });
  });

  it('uses the configured timezone across UTC midnight and daylight-saving changes', () => {
    expect(parseCareDate('watered yesterday', 'PAST', new Date('2026-09-18T01:00:00Z'), 'America/Los_Angeles')?.toISOString()).toBe('2026-09-17T01:00:00.000Z');
    expect(parseCareDate('10 September 2026', 'PAST', new Date('2026-09-18T01:00:00Z'), 'Asia/Kolkata')?.toISOString()).toBe('2026-09-10T03:30:00.000Z');
    expect(parseCareDate('watered yesterday', 'PAST', new Date('2026-03-08T13:00:00Z'), 'America/New_York')?.toISOString()).toBe('2026-03-07T14:00:00.000Z');
  });

});
