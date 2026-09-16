import { TrackingService } from './tracking.service';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';

describe('visit tracking permissions and freshness', () => {
  const point = { latitude: 28.6, longitude: 77.3 };
  let service: TrackingService;
  const db = {
    serviceBooking: { findUnique: jest.fn() },
    address: { findFirst: jest.fn() },
    bookingActivity: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    $queryRaw: jest.fn(), $transaction: jest.fn(),
  };
  let job = { id: 'visit', userId: 'customer', addressId: 'address', status: 'ON_THE_WAY', gardener: { userId: 'gardener', active: true, name: 'Gardener' }, service: { title: 'Care' } };
  beforeEach(() => {
    job = { id: 'visit', userId: 'customer', addressId: 'address', status: 'ON_THE_WAY', gardener: { userId: 'gardener', active: true, name: 'Gardener' }, service: { title: 'Care' } };
    jest.clearAllMocks();
    db.serviceBooking.findUnique.mockImplementation(() => Promise.resolve(job));
    db.address.findFirst.mockResolvedValue({ fullAddress: 'Visit address' });
    db.bookingActivity.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation((fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => fn(db as unknown as Prisma.TransactionClient));
    service = new TrackingService(db as unknown as PrismaService);
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
    db.bookingActivity.findMany.mockResolvedValue([{ kind: 'TRACKING_LOCATION', createdAt: new Date(), data: point }]);
    expect((await service.read('customer', 'visit')).live).toBe(true);
    db.bookingActivity.findMany.mockResolvedValue([{ kind: 'TRACKING_LOCATION', createdAt: new Date(Date.now() - 60000), data: point }]);
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
  it('rejects impersonating a gardener and lets the actual gardener stop sharing', async () => {
    await expect(service.read('customer', 'visit', true)).rejects.toThrow();
    await expect(service.stop('customer', 'visit')).rejects.toThrow();
    await expect(service.stop('gardener', 'visit')).resolves.toEqual({ stopped: true });
    expect(db.bookingActivity.deleteMany).toHaveBeenCalled();
  });
});
