import { TrackingService } from './tracking.service';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';
import { TrackingEvents } from './tracking-events.service';

describe('visit tracking permissions and freshness', () => {
  const point = { latitude: 28.6, longitude: 77.3 };
  let service: TrackingService;
  const events = { publish: jest.fn() };
  const db = {
    serviceBooking: { findUnique: jest.fn() },
    address: { findFirst: jest.fn() },
    bookingActivity: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  let job = {
    id: 'visit',
    userId: 'customer',
    addressId: 'address',
    status: 'ON_THE_WAY',
    gardener: { userId: 'gardener', active: true, name: 'Gardener' },
    service: { title: 'Care' },
  };
  beforeEach(() => {
    job = {
      id: 'visit',
      userId: 'customer',
      addressId: 'address',
      status: 'ON_THE_WAY',
      gardener: { userId: 'gardener', active: true, name: 'Gardener' },
      service: { title: 'Care' },
    };
    jest.clearAllMocks();
    db.serviceBooking.findUnique.mockImplementation(() => Promise.resolve(job));
    db.address.findFirst.mockResolvedValue({ fullAddress: 'Visit address' });
    db.bookingActivity.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation((fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      fn(db as unknown as Prisma.TransactionClient),
    );
    service = new TrackingService(
      db as unknown as PrismaService,
      events as unknown as TrackingEvents,
    );
  });
  it('denies unrelated users', async () => {
    await expect(service.read('stranger', 'visit')).rejects.toThrow();
    await expect(service.write('stranger', 'visit', point)).rejects.toThrow();
  });
  it('only lets the assigned gardener publish their location while travelling', async () => {
    await expect(service.write('customer', 'visit', point)).rejects.toThrow();
    await expect(service.write('gardener', 'visit', point)).resolves.toEqual({ saved: true });
    job.status = 'COMPLETED';
    await expect(service.write('gardener', 'visit', point)).rejects.toThrow();
  });
  it('only the customer may set the visit pin', async () => {
    await expect(service.write('gardener', 'visit', point, true)).rejects.toThrow();
    await expect(service.write('customer', 'visit', point, true)).resolves.toEqual({ saved: true });
  });
  it('hides stale and completed-trip location', async () => {
    db.bookingActivity.findMany.mockResolvedValue([
      { kind: 'TRACKING_LOCATION', actorId: 'gardener', createdAt: new Date(), data: point },
    ]);
    expect((await service.read('customer', 'visit')).live).toBe(true);
    db.bookingActivity.findMany.mockResolvedValue([
      {
        kind: 'TRACKING_LOCATION',
        actorId: 'gardener',
        createdAt: new Date(Date.now() - 60000),
        data: point,
      },
    ]);
    expect((await service.read('customer', 'visit')).location).toBeNull();
    job.status = 'COMPLETED';
    expect((await service.read('customer', 'visit')).location).toBeNull();
  });
  it('hides the customer address and pin until acceptance', async () => {
    job.status = 'REQUESTED';
    const result = await service.read('gardener', 'visit');
    expect(result.address).toBeNull();
    expect(result.destination).toBeNull();
    expect(db.address.findFirst).not.toHaveBeenCalled();
  });
  it('never emits a location event before commit or after a failed write', async () => {
    db.$transaction.mockImplementationOnce(
      async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        const result = await fn(db as unknown as Prisma.TransactionClient);
        expect(events.publish).not.toHaveBeenCalled();
        return result;
      },
    );
    await service.write('gardener', 'visit', point);
    expect(events.publish).toHaveBeenCalledWith('visit');
    events.publish.mockClear();
    db.$transaction.mockRejectedValueOnce(new Error('rollback'));
    await expect(service.write('gardener', 'visit', point)).rejects.toThrow('rollback');
    expect(events.publish).not.toHaveBeenCalled();
  });
  it('does not expose a previously assigned gardener location', async () => {
    db.bookingActivity.findMany.mockResolvedValue([
      { kind: 'TRACKING_LOCATION', actorId: 'old-gardener', createdAt: new Date(), data: point },
    ]);
    expect((await service.read('customer', 'visit')).location).toBeNull();
  });
  it('rejects impersonating a gardener and lets the actual gardener stop sharing', async () => {
    await expect(service.read('customer', 'visit', true)).rejects.toThrow();
    await expect(service.stop('customer', 'visit')).rejects.toThrow();
    await expect(service.stop('gardener', 'visit')).resolves.toEqual({ stopped: true });
    expect(db.bookingActivity.deleteMany).toHaveBeenCalled();
    expect(events.publish).toHaveBeenCalledWith('visit');
  });
});
