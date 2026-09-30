import { AdminAccessService } from './admin-access.service';
import { AdminService } from './admin.service';
import { csvCell, permits } from './admin.policy';
const admin = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  phone: null,
  role: 'ADMIN' as const,
};
describe('admin authorization', () => {
  it('rejects customers even when a matching staff row exists', async () => {
    const lookup = jest.fn().mockResolvedValue({ active: true, role: 'SUPER_ADMIN' });
    const access = new AdminAccessService({ adminStaff: { findUnique: lookup } } as never);
    await expect(access.require({ ...admin, role: 'CUSTOMER' })).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });
  it('rejects deactivated staff and missing permissions', async () => {
    const lookup = jest.fn().mockResolvedValue({ active: false, role: 'SUPER_ADMIN' });
    const access = new AdminAccessService({ adminStaff: { findUnique: lookup } } as never);
    await expect(access.require(admin)).rejects.toThrow();
    lookup.mockResolvedValue({ active: true, role: 'SUPPORT_ADMIN' });
    await expect(access.require(admin, 'finance.update')).rejects.toThrow();
    await expect(access.require(admin, 'support.update')).resolves.toMatchObject({
      role: 'SUPPORT_ADMIN',
    });
  });
  it('keeps staff administration exclusive and unknown roles denied', () => {
    expect(permits('CONTENT_ADMIN', 'admin.manage')).toBe(false);
    expect(permits('ORDER_ADMIN', 'finance.update')).toBe(false);
    expect(permits('SUPER_ADMIN', 'admin.manage')).toBe(true);
    expect(permits('FAKE_ADMIN', 'dashboard.read')).toBe(false);
  });
});
describe('admin operations', () => {
  const service = (tx: object): AdminService =>
    new AdminService(
      { $transaction: (fn: (db: object) => unknown) => fn(tx) } as never,
      { require: jest.fn().mockResolvedValue({ role: 'SUPER_ADMIN' }) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
  it('rejects invalid order transitions before writing', async () => {
    const updateMany = jest.fn();
    const audit = jest.fn();
    const adminService = service({
      order: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ status: 'DELIVERED' }),
        updateMany,
      },
      adminAuditLog: { create: audit },
    });
    await expect(
      adminService.change(admin, 'orders', 'id', {
        values: { status: 'CANCELLED' },
        reason: 'Customer request',
      }),
    ).rejects.toThrow('Cannot move');
    expect(updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it('prevents negative stock and does not record a successful adjustment', async () => {
    const audit = jest.fn();
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const adminService = service({
      product: { findUniqueOrThrow: jest.fn().mockResolvedValue({ stock: 2 }), updateMany },
      adminAuditLog: { create: audit },
    });
    await expect(
      adminService.change(admin, 'inventory', 'id', {
        values: { adjustment: -3 },
        reason: 'Damaged stock',
      }),
    ).rejects.toThrow('negative');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'id', stock: { gte: 3 } } }),
    );
    expect(audit).not.toHaveBeenCalled();
  });
  it('requires notification preview confirmation', async () => {
    const create = jest.fn();
    const adminService = service({
      adminNotificationDraft: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ status: 'DRAFT' }),
      },
      notification: { create },
    });
    await expect(
      adminService.change(admin, 'notifications', 'id', {
        values: { status: 'SENT' },
        reason: 'Account update',
      }),
    ).rejects.toThrow('confirm');
    expect(create).not.toHaveBeenCalled();
  });
  it('neutralizes CSV formulas and escapes quotes and line breaks', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('hello\nworld')).toBe('"hello\nworld"');
    expect(csvCell(null)).toBe('""');
  });
  it('does not restock twice when a concurrent cancellation wins', async () => {
    const restock = jest.fn();
    const audit = jest.fn();
    const adminService = service({
      order: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ status: 'PLACED', items: [] }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      product: { update: restock },
      adminAuditLog: { create: audit },
    });
    await expect(
      adminService.change(admin, 'orders', 'id', {
        values: { status: 'CANCELLED' },
        reason: 'Customer requested cancellation',
      }),
    ).rejects.toThrow('Order changed');
    expect(restock).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it('prevents disabling the final active super administrator', async () => {
    const update = jest.fn();
    const adminService = service({
      $queryRaw: jest.fn().mockResolvedValue([]),
      adminStaff: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ role: 'SUPER_ADMIN', active: true }),
        count: jest.fn().mockResolvedValue(1),
        update,
      },
    });
    await expect(
      adminService.change(admin, 'admin-users', admin.id, {
        values: { active: false },
        reason: 'Deactivate account',
      }),
    ).rejects.toThrow('at least one');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('filtered exports', () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({
    id: String(i),
    name: `Category ${i}`,
    slug: `category-${i}`,
    active: true,
  }));
  const setup = (
    total = rows.length,
  ): { service: AdminService; audit: jest.Mock; transaction: jest.Mock; findMany: jest.Mock } => {
    const audit = jest.fn();
    const findMany = jest.fn(({ skip, take }: { skip: number; take: number }) =>
      Promise.resolve(rows.slice(skip, skip + take)),
    );
    const tx = {
      category: { findMany, count: jest.fn().mockResolvedValue(total) },
      adminAuditLog: { create: audit },
    };
    const transaction = jest.fn((fn: (value: object) => unknown) => fn(tx));
    return {
      service: new AdminService(
        { $transaction: transaction } as never,
        { require: jest.fn().mockResolvedValue({ role: 'SUPER_ADMIN' }) } as never,
        {} as never,
        {} as never,
        {} as never,
      ),
      audit,
      transaction,
      findMany,
    };
  };
  it('exports every filtered page from one repeatable-read snapshot', async () => {
    const { service, audit, transaction, findMany } = setup();
    const result = await service.export(admin, 'categories', {
      page: 4,
      limit: 25,
      scope: 'all',
      search: 'Category',
    });
    expect(result.total).toBe(101);
    expect(result.csv.split('\r\n')).toHaveLength(102);
    expect(result.csv).toContain('Category 100');
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      timeout: 60000,
    });
    expect(audit).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized exports without recording success', async () => {
    const { service, audit } = setup(10001);
    await expect(
      service.export(admin, 'categories', { page: 1, limit: 25, scope: 'all' }),
    ).rejects.toThrow('10,000');
    expect(audit).not.toHaveBeenCalled();
  });
});
