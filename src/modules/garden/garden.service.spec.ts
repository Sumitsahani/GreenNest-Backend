/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { CareType } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import type { PlantIntelligenceService } from '../intelligence/plant-intelligence.service';
import { CareAction } from './dto/garden.dto';
import type { GardenCarePlanService } from './garden-care-plan.service';
import { GardenService } from './garden.service';
import type { WeatherCareService } from './weather-care.service';

describe('GardenService care events', () => {
  it('records watering and reschedules reminders without calling Gemini care plans', async () => {
    const plant = {
      id: 'plant-1',
      userId: 'user-1',
      wateringDays: 7,
      health: 88,
      careEvents: [],
    };
    const findFirst = jest.fn().mockResolvedValue(plant);
    const tx = {
      careEvent: { create: jest.fn().mockResolvedValue({}) },
      gardenPlant: { update: jest.fn().mockResolvedValue({}) },
      careReminder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      gardenPlant: { findFirst },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const carePlans = { create: jest.fn() } as unknown as GardenCarePlanService;
    const intelligence = {
      recordCareEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlantIntelligenceService;
    const weatherCare = {} as WeatherCareService;
    const service = new GardenService(prisma, carePlans, intelligence, weatherCare);

    await service.care('user-1', 'plant-1', { type: CareAction.WATER });

    expect(carePlans.create).not.toHaveBeenCalled();
    expect(tx.careReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { plantId: 'plant-1', type: CareType.WATER, enabled: true },
        data: expect.objectContaining({ lastNotifiedAt: null }),
      }),
    );
    expect(intelligence.recordCareEvent).toHaveBeenCalledWith(
      'user-1',
      'plant-1',
      CareAction.WATER,
      undefined,
    );
  });
});
