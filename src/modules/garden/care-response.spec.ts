/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/explicit-function-return-type */
import { CareResponse } from './dto/garden.dto';
import { GardenService } from './garden.service';
import type { PrismaService } from '../../database/prisma.service';
import type { GardenCarePlanService } from './garden-care-plan.service';
import type { PlantIntelligenceService } from '../intelligence/plant-intelligence.service';
import type { WeatherCareService } from './weather-care.service';

describe('smart care responses', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-07T06:00:00Z')));
  afterEach(() => jest.useRealTimers());
  function setup(owned = true) {
    const plant = {
      id: 'p',
      lifecycleStatus: 'ACTIVE',
      nextWateringAt: new Date('2026-09-06'),
      lastWateredAt: new Date('2026-08-30'),
    };
    const tx = {
      careReminder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn() },
      careEvent: { create: jest.fn() },
      notification: { updateMany: jest.fn() },
    };
    const prisma = {
      gardenPlant: { findFirst: jest.fn().mockResolvedValue(owned ? plant : null) },
      $transaction: jest.fn((fn: (value: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    return {
      service: new GardenService(
        prisma,
        {} as GardenCarePlanService,
        {} as PlantIntelligenceService,
        {} as WeatherCareService,
        { invalidate: jest.fn() } as never,
      ),
      tx,
      plant,
    };
  }
  it('records wet soil as a note and defers 24h without inventing a watering event', async () => {
    const { service, tx, plant } = setup();
    await service.respondCare('u', 'p', { action: CareResponse.SOIL_WET });
    expect(tx.careReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snoozedUntil: new Date('2026-09-08T06:00:00Z'),
          responseReason: 'SOIL_WET',
          notificationCount: 0,
        }),
      }),
    );
    expect(tx.careEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'NOTE' }),
    });
    expect(plant.lastWateredAt).toEqual(new Date('2026-08-30'));
    expect(tx.notification.updateMany).toHaveBeenCalled();
  });
  it('uses the user-selected busy time', async () => {
    const { service, tx } = setup();
    const remindAt = '2026-09-07T08:00:00Z';
    await service.respondCare('u', 'p', { action: CareResponse.BUSY, remindAt });
    expect(tx.careReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ snoozedUntil: new Date(remindAt) }),
      }),
    );
  });
  it.each([undefined, '2026-09-06T08:00:00Z', '2026-10-01T08:00:00Z'])(
    'rejects invalid snooze %s',
    async (remindAt) => {
      const { service, tx } = setup();
      await expect(
        service.respondCare('u', 'p', { action: CareResponse.BUSY, remindAt }),
      ).rejects.toThrow();
      expect(tx.careReminder.updateMany).not.toHaveBeenCalled();
    },
  );
  it('does not mutate another user’s plant', async () => {
    const { service, tx } = setup(false);
    await expect(
      service.respondCare('u', 'p', { action: CareResponse.SOIL_WET }),
    ).rejects.toThrow();
    expect(tx.careReminder.updateMany).not.toHaveBeenCalled();
  });
});
