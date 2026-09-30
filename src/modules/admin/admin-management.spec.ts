import {
  addStaff,
  adjustRewards,
  changeCustomer,
  manageBooking,
  memoryData,
} from './admin-management';
import { AdminService } from './admin.service';
import { AdminAccessService } from './admin-access.service';
const id = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003';
const actor = { id, email: 'admin@example.test', phone: null, role: 'ADMIN' as const };

describe('customer and staff management', () => {
  it('rejects modifying auth authority through profile fields', async () => {
    const execute = jest.fn();
    await expect(
      changeCustomer({ $executeRaw: execute } as never, userId, { role: 'ADMIN' }),
    ).rejects.toThrow('only the fields');
    expect(execute).not.toHaveBeenCalled();
  });
  it('changes only app-owned metadata, preserving other auth data', async () => {
    const execute = jest.fn();
    const query = jest.fn().mockResolvedValue([{ id: userId, name: 'Customer', suspended: false }]);
    await changeCustomer({ $queryRaw: query, $executeRaw: execute } as never, userId, {
      suspended: true,
    });
    const args = execute.mock.calls[0] as unknown[];
    expect(args.slice(1)).toEqual(['{}', '{"suspended":true}', userId]);
    expect((args[0] as string[]).join('')).not.toMatch(/encrypted_password|email =|phone =/);
  });
  it.each([
    { confirmed: false, suspended: false },
    { confirmed: true, suspended: true },
  ])('rejects ineligible staff accounts %j', async (state) => {
    const create = jest.fn();
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: userId, email: 'staff@example.test', ...state }]),
      adminStaff: { create },
    };
    await expect(
      addStaff(tx as never, { email: 'staff@example.test', role: 'SUPPORT_ADMIN' }),
    ).rejects.toThrow('verified, active');
    expect(create).not.toHaveBeenCalled();
  });
  it('creates staff membership and trusted role together', async () => {
    const row = { userId, role: 'SUPPORT_ADMIN', email: 'staff@example.test' };
    const execute = jest.fn();
    const create = jest.fn().mockResolvedValue(row);
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: userId, email: row.email, confirmed: true, suspended: false }]),
      $executeRaw: execute,
      adminStaff: { findUnique: jest.fn().mockResolvedValue(null), create },
    };
    await expect(
      addStaff(tx as never, { email: ' STAFF@example.test ', role: row.role }),
    ).resolves.toEqual(row);
    expect(create).toHaveBeenCalledWith({ data: row });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('does not let support staff grant access or change customer accounts', async () => {
    const db = {
      adminStaff: {
        findUnique: jest.fn().mockResolvedValue({ active: true, role: 'SUPPORT_ADMIN' }),
      },
      $transaction: jest.fn(),
    };
    const service = new AdminService(
      db as never,
      new AdminAccessService(db as never),
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.create(actor, 'admin-users', {
        values: { email: 'x@example.test', role: 'SUPER_ADMIN' },
        reason: 'New staff',
        confirmed: true,
      }),
    ).rejects.toThrow('permission');
    await expect(
      service.change(actor, 'customers', userId, {
        values: { suspended: true },
        reason: 'Review account',
      }),
    ).rejects.toThrow('permission');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('reward adjustments', () => {
  const values = { userId, requestId, points: -10, title: 'Correction' };
  const transaction = (
    balance = 20,
  ): {
    $queryRaw: jest.Mock;
    rewardTransaction: { aggregate: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
  } => ({
    $queryRaw: jest.fn().mockResolvedValue([{ id: userId }]),
    rewardTransaction: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { points: balance } }),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id, ...values }),
    },
  });
  it('serializes balance changes and rejects overdrafts', async () => {
    const tx = transaction(5);
    await expect(adjustRewards(tx as never, values)).rejects.toThrow('negative');
    expect(tx.rewardTransaction.create).not.toHaveBeenCalled();
    expect((tx.$queryRaw.mock.calls as unknown[][])[1]?.[1]).toBe(`rewards:${userId}`);
  });
  it('returns an identical retry without applying the points again', async () => {
    const tx = transaction();
    tx.rewardTransaction.findUnique.mockResolvedValue({ id, ...values });
    await expect(adjustRewards(tx as never, values)).resolves.toMatchObject({ replay: true });
    expect(tx.rewardTransaction.create).not.toHaveBeenCalled();
    await expect(adjustRewards(tx as never, { ...values, points: 10 })).rejects.toThrow(
      'another adjustment',
    );
  });
  it('records a valid adjustment as an immutable ledger entry', async () => {
    const tx = transaction();
    await adjustRewards(tx as never, values);
    expect(tx.rewardTransaction.create).toHaveBeenCalledWith({
      data: {
        userId,
        referenceId: requestId,
        points: -10,
        title: 'Correction',
        type: 'ADMIN_ADJUSTMENT',
      },
    });
  });
});

describe('booking operations', () => {
  const at = new Date('2099-01-05T06:00:00Z');
  const booking = {
    id,
    userId,
    gardenerId: null,
    addressId: id,
    serviceId: id,
    status: 'REQUESTED',
    scheduledAt: at,
    service: { durationMinutes: 60 },
  };
  const transaction = (): {
    $queryRaw: jest.Mock;
    serviceBooking: { findUniqueOrThrow: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
    gardener: { findUnique: jest.Mock };
    address: { findFirst: jest.Mock };
    bookingActivity: { create: jest.Mock };
  } => ({
    $queryRaw: jest.fn(),
    serviceBooking: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(booking),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    gardener: {
      findUnique: jest.fn().mockResolvedValue({
        id: userId,
        profileComplete: true,
        active: true,
        verified: true,
        available: true,
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        startTime: '00:00',
        endTime: '23:59',
        serviceIds: [id],
        postalCodes: ['110001'],
      }),
    },
    address: { findFirst: jest.fn().mockResolvedValue({ postalCode: '110001' }) },
    bookingActivity: { create: jest.fn() },
  });
  it('assigns eligible gardeners and records a visit activity', async () => {
    const tx = transaction();
    await manageBooking(
      tx as never,
      id,
      { action: 'ASSIGN', gardenerId: userId },
      actor.id,
      'Cover visit',
    );
    expect(tx.serviceBooking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { gardenerId: userId, scheduledAt: at, status: 'GARDENER_ASSIGNED' },
      }),
    );
    expect(tx.bookingActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: actor.id, kind: 'assign' }) as unknown,
      }),
    );
  });
  it('rejects an overlapping job and records no successful activity', async () => {
    const tx = transaction();
    tx.serviceBooking.findMany.mockResolvedValue([
      { scheduledAt: new Date(at.getTime() - 1800000), service: { durationMinutes: 60 } },
    ]);
    await expect(
      manageBooking(
        tx as never,
        id,
        { action: 'ASSIGN', gardenerId: userId },
        actor.id,
        'Cover visit',
      ),
    ).rejects.toThrow('overlaps');
    expect(tx.serviceBooking.updateMany).not.toHaveBeenCalled();
    expect(tx.bookingActivity.create).not.toHaveBeenCalled();
  });
  it('rejects edits after a visit has started', async () => {
    const tx = transaction();
    tx.serviceBooking.findUniqueOrThrow.mockResolvedValue({ ...booking, status: 'IN_PROGRESS' });
    await expect(
      manageBooking(
        tx as never,
        id,
        { action: 'ASSIGN', gardenerId: userId },
        actor.id,
        'Cover visit',
      ),
    ).rejects.toThrow('unstarted');
    expect(tx.serviceBooking.updateMany).not.toHaveBeenCalled();
  });
  it('detects a concurrent booking change', async () => {
    const tx = transaction();
    tx.serviceBooking.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      manageBooking(
        tx as never,
        id,
        { action: 'ASSIGN', gardenerId: userId },
        actor.id,
        'Cover visit',
      ),
    ).rejects.toThrow('Booking changed');
    expect(tx.bookingActivity.create).not.toHaveBeenCalled();
  });
});

it('archives AI memory without deleting it and rejects invalid statuses', () => {
  expect(memoryData({ status: 'ARCHIVED' })).toMatchObject({
    status: 'ARCHIVED',
    supersededAt: expect.any(Date) as unknown,
  });
  expect(memoryData({ status: 'ACTIVE' })).toEqual({ status: 'ACTIVE', supersededAt: null });
  expect(() => memoryData({ status: 'FAKE' })).toThrow('Invalid');
});
