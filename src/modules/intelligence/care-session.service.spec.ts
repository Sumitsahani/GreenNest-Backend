/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import { CareSessionItemStatus, CareType } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { CareSessionService } from './care-session.service';

describe('CareSessionService', () => {
  it('records 17 user-reported waterings and one skipped exception', async () => {
    const plants = Array.from({ length: 18 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      wateringDays: 7,
    }));
    const itemCreate = jest.fn();
    const eventCreate = jest
      .fn()
      .mockImplementation(({ data }) => ({ id: `event-${data.plantId}` }));
    const tx = {
      $executeRaw: jest.fn(),
      careSession: {
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
        update: jest.fn().mockResolvedValue({ id: 'session-1', items: [] }),
      },
      careSessionItem: { create: itemCreate },
      careEvent: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: `care-${data.plantId}` })),
      },
      plantEvent: { create: eventCreate },
      gardenPlant: { findMany: jest.fn().mockResolvedValue(plants), update: jest.fn() },
      careReminder: { updateMany: jest.fn() },
      plantRecommendation: { updateMany: jest.fn() },
      notification: { updateMany: jest.fn() },
      engagementEvent: { create: jest.fn() },
    };
    const prisma = {
      gardenPlant: { findMany: jest.fn().mockResolvedValue(plants) },
      $transaction: jest.fn((fn: (value: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    const garden = { invalidate: jest.fn() };
    const service = new CareSessionService(prisma, garden as never);
    await service.complete('user-1', {
      actionType: CareType.WATER,
      plantIds: plants.map((value) => value.id),
      skippedPlantIds: [plants[17]!.id],
    });
    expect(itemCreate).toHaveBeenCalledTimes(18);
    expect(
      itemCreate.mock.calls.filter(
        (call) => call[0].data.status === CareSessionItemStatus.COMPLETED,
      ),
    ).toHaveLength(17);
    expect(itemCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        plantId: plants[17]!.id,
        status: CareSessionItemStatus.SKIPPED,
      }),
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: 'USER_REPORTED', confidence: 0.8 }),
    });
  });
  it('rejects a plant outside the authenticated user garden before writing', async () => {
    const prisma = {
      gardenPlant: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new CareSessionService(prisma, { invalidate: jest.fn() } as never);
    await expect(
      service.complete('user-1', {
        actionType: CareType.WATER,
        plantIds: ['00000000-0000-4000-8000-000000000001'],
      }),
    ).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('replays an existing client action without duplicating any watering', async () => {
    const session = { id: 'action-1', userId: 'u', items: [{ plantId: 'p', status: 'COMPLETED' }] };
    const tx = { $executeRaw: jest.fn(), careSession: { findUnique: jest.fn().mockResolvedValue(session), create: jest.fn() } };
    const prisma = { gardenPlant: { findMany: jest.fn().mockResolvedValue([{ id: 'p' }]) }, $transaction: jest.fn((fn: (v: typeof tx) => unknown) => fn(tx)) } as unknown as PrismaService;
    const service = new CareSessionService(prisma, { invalidate: jest.fn() } as never);
    expect(await service.complete('u', { actionType: CareType.WATER, plantIds: ['p'], clientActionId: 'action-1' })).toBe(session);
    expect(tx.careSession.create).not.toHaveBeenCalled();
    session.userId = 'another-user';
    await expect(service.complete('u', { actionType: CareType.WATER, plantIds: ['p'], clientActionId: 'action-1' })).rejects.toThrow();
  });

  it('corrects only the selected skipped plant and preserves the other session items', async () => {
    const now = new Date();
    const session = { id: 's', userId: 'u', status: 'COMPLETED', completedAt: now, items: ['a', 'b'].map(plantId => ({ plantId, status: 'COMPLETED', caredAt: now, careEventId: `care-${plantId}`, eventId: `event-${plantId}`, plant: { lastWateredAt: now } })) };
    const deleted = jest.fn();
    const update = jest.fn().mockResolvedValue({ items: [] });
    const tx = { $executeRaw: jest.fn(), careSession: { findFirstOrThrow: jest.fn().mockResolvedValue(session), update },
      careEvent: { deleteMany: deleted, findFirst: jest.fn().mockResolvedValue(null) },
      gardenPlant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ wateringDays: 7, lastWateredAt: now, careEvents: [] }), update: jest.fn() },
      careReminder: { updateMany: jest.fn() }, plantEvent: { create: jest.fn() }, careSessionItem: { updateMany: jest.fn() }, engagementEvent: { create: jest.fn() } };
    const prisma = { careSession: { findFirst: jest.fn().mockResolvedValue(session) }, $transaction: jest.fn((fn: (v: typeof tx) => unknown) => fn(tx)) } as unknown as PrismaService;
    await new CareSessionService(prisma, { invalidate: jest.fn() } as never).undo('u', 's', ['a']);
    expect(deleted).toHaveBeenCalledTimes(1);
    expect(deleted).toHaveBeenCalledWith({ where: { id: 'care-a', plantId: 'a' } });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
  });

});
