/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { PrismaService } from '../../database/prisma.service';
import type { WeatherCareService } from '../garden/weather-care.service';
import { CareReminderDispatcherService } from './care-reminder-dispatcher.service';

describe('CareReminderDispatcherService', () => {
  it('creates one in-app notification and marks a due reminder delivered', async () => {
    const scheduledAt = new Date('2026-09-05T05:00:00.000Z');
    const reminder = {
      id: 'reminder-1',
      enabled: true,
      scheduledAt,
      lastNotifiedAt: null,
      plant: {
        id: 'plant-1',
        userId: 'user-1',
        name: 'Money Plant',
        location: 'Living room',
        weatherLocation: 'Delhi',
        latitude: 28.61,
        longitude: 77.2,
        wateringDays: 7,
        lastWateredAt: new Date('2026-08-29T05:00:00.000Z'),
        nextWateringAt: scheduledAt,
      },
    };
    const notificationCreate = jest.fn().mockResolvedValue({});
    const reminderUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      careReminder: {
        findMany: jest.fn().mockResolvedValue([reminder]),
        update: reminderUpdate,
      },
      userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      pushDevice: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { create: notificationCreate },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    } as unknown as PrismaService;
    const weatherCare = {
      createReminder: jest.fn().mockResolvedValue({
        scheduledAt: new Date('2026-09-05T05:00:00.000Z'),
        title: 'Check the soil today',
        reason: 'The adjusted care date is due. Check the topsoil first.',
      }),
    } as unknown as WeatherCareService;
    const service = new CareReminderDispatcherService(prisma, weatherCare);

    await service.dispatchDueReminders();

    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', type: 'CARE_REMINDER' }),
      }),
    );
    expect(reminderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'reminder-1' },
        data: expect.objectContaining({ lastNotifiedAt: expect.any(Date) }),
      }),
    );
  });
});
