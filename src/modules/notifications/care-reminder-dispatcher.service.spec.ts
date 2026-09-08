/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/explicit-function-return-type */
import type { PrismaService } from '../../database/prisma.service';
import type { WeatherCareService } from '../garden/weather-care.service';
import { CareReminderDispatcherService } from './care-reminder-dispatcher.service';

describe('CareReminderDispatcherService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-07T06:00:00Z')));
  afterEach(() => jest.useRealTimers());
  function setup(
    options: {
      claimed?: number;
      pushEnabled?: boolean;
      count?: number;
      appLanguage?: 'ENGLISH' | 'HINDI';
    } = {},
  ) {
    const due = new Date('2026-09-06T06:00:00Z');
    const reminder = {
      id: 'reminder-1',
      enabled: true,
      scheduledAt: due,
      updatedAt: due,
      lastNotifiedAt: null,
      notificationCount: options.count ?? 0,
      plant: {
        id: 'plant-1',
        userId: 'user-1',
        name: 'Money Plant',
        location: 'Living room',
        environment: 'INDOOR',
        weatherLocation: 'Delhi',
        latitude: 28.61,
        longitude: 77.2,
        wateringDays: 7,
        lastWateredAt: due,
        nextWateringAt: due,
      },
    };
    const create = jest.fn().mockResolvedValue({});
    const claim = jest.fn().mockResolvedValue({ count: options.claimed ?? 1 });
    const devices = jest.fn().mockResolvedValue([]);
    const tx = { notification: { create }, careReminder: { updateMany: claim } };
    const prisma = {
      careReminder: { findMany: jest.fn().mockResolvedValue([reminder]) },
      userSettings: {
        findUnique: jest.fn().mockResolvedValue({
          careReminders: true,
          pushEnabled: options.pushEnabled ?? true,
          careTimezone: 'Asia/Kolkata',
          preferredCareHour: 9,
          appLanguage: options.appLanguage ?? 'ENGLISH',
        }),
      },
      pushDevice: { findMany: devices },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const weather = {
      createReminder: jest
        .fn()
        .mockResolvedValue({ scheduledAt: due, title: 'Check soil', reason: 'Water only if dry.' }),
    } as unknown as WeatherCareService;
    const garden = {
      today: jest
        .fn()
        .mockResolvedValue({ items: [{ plant: { id: 'plant-1' }, reason: 'Water only if dry.' }] }),
    };
    return {
      service: new CareReminderDispatcherService(prisma, weather, garden as never),
      create,
      claim,
      devices,
    };
  }
  it('claims a cycle and stores a plant-linked notification', async () => {
    const subject = setup();
    await subject.service.dispatchDueReminders();
    expect(subject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        plantId: 'plant-1',
        type: 'GARDEN_CARE_BATCH',
      }),
    });
    expect(subject.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { lastNotifiedAt: expect.any(Date), notificationCount: { increment: 1 } },
      }),
    );
  });
  it('does not send after a concurrent response or competing dispatcher wins the claim', async () => {
    const subject = setup({ claimed: 0 });
    await subject.service.dispatchDueReminders();
    expect(subject.create).not.toHaveBeenCalled();
    expect(subject.devices).not.toHaveBeenCalled();
  });
  it('keeps the inbox available when push is disabled', async () => {
    const subject = setup({ pushEnabled: false });
    await subject.service.dispatchDueReminders();
    expect(subject.create).toHaveBeenCalled();
    expect(subject.devices).not.toHaveBeenCalled();
  });
  it('stores Hindi care copy for a Hindi app preference', async () => {
    const subject = setup({ appLanguage: 'HINDI' });
    await subject.service.dispatchDueReminders();
    expect(subject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Money Plant: देखभाल बाकी है',
        message: 'Money Plant की मिट्टी जाँचें और सूखी लगे तभी पानी दें।',
      }),
    });
  });
  it('stops after three reminders', async () => {
    const subject = setup({ count: 3 });
    await subject.service.dispatchDueReminders();
    expect(subject.claim).not.toHaveBeenCalled();
  });
});
