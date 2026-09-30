import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, OrderStatus, BookingStatus, SupportConversationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AdminAccessService } from './admin-access.service';
import { adminRoles, csvCell, orderTransitions, permissionsFor, permits } from './admin.policy';
import { resources, type Resource } from './admin.resources';
import { AdminQuery, AdminChange } from './admin.dto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PlantStateService } from '../intelligence/plant-state.service';
import { GardenerService } from '../gardener/gardener.service';
import { SupportService } from '../support/support.service';
import {
  addStaff,
  adjustRewards,
  changeCustomer,
  customerProfile,
  manageBooking,
  memoryData,
  onlyFields,
  requiredText,
} from './admin-management';

type Row = Record<string, unknown>;
type Delegate = {
  findMany(args: unknown): Promise<Row[]>;
  count(args: unknown): Promise<number>;
  findUnique(args: unknown): Promise<Row | null>;
};
const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const text = (v: unknown, name: string, max = 4000): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw new BadRequestException(`${name} is required (maximum ${max} characters).`);
  return v.trim();
};
const num = (v: unknown, name: string, min = 0, max = 10000000): number => {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim()) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max)
    throw new BadRequestException(`${name} must be between ${min} and ${max}.`);
  return n;
};
const bool = (v: unknown, name: string): boolean => {
  if (typeof v !== 'boolean') throw new BadRequestException(`${name} must be true or false.`);
  return v;
};
const uuid = (v: unknown): string => {
  const s = text(v, 'ID', 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
    throw new BadRequestException('Invalid ID.');
  return s;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AdminAccessService,
    private readonly states: PlantStateService,
    private readonly gardeners: GardenerService,
    private readonly support: SupportService,
  ) {}
  async me(user: AuthenticatedUser): Promise<unknown> {
    const staff = await this.access.require(user);
    return {
      ...staff,
      permissions: permissionsFor(staff.role),
      resources: Object.entries(resources)
        .filter(([, r]) => permits(staff.role, r.permission))
        .map(([key, r]) => ({
          key,
          title: r.title,
          columns: r.columns,
          statuses: this.statuses(key),
        })),
      customers: permits(staff.role, 'customers.read'),
      finance: permits(staff.role, 'finance.read'),
      system: permits(staff.role, 'system.read'),
    };
  }
  private range(q: AdminQuery): Prisma.DateTimeFilter {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime())))
      throw new BadRequestException('Use valid dates.');
    if (from && to && from >= to)
      throw new BadRequestException('End date must be after start date.');
    return { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
  }
  async lookup(user: AuthenticatedUser, key: string, q: AdminQuery): Promise<unknown> {
    const staff = await this.access.require(user);
    if (key === 'customers') {
      if (
        !['customers.read', 'rewards.update', 'notifications.update'].some((p) =>
          permits(staff.role, p),
        )
      )
        await this.access.require(user, 'customers.read');
      const search = `%${q.search ?? ''}%`;
      const rows = await this.db.$queryRaw<
        Row[]
      >`SELECT id, email, raw_user_meta_data->>'name' AS name
        FROM auth.users WHERE COALESCE(raw_app_meta_data->>'role','') <> 'ADMIN'
          AND COALESCE(raw_app_meta_data->>'suspended','false') <> 'true'
          AND (email ILIKE ${search} OR raw_user_meta_data->>'name' ILIKE ${search} OR id::text ILIKE ${search})
        ORDER BY created_at DESC, id DESC LIMIT ${q.limit + 1} OFFSET ${(q.page - 1) * q.limit}`;
      return { rows: rows.slice(0, q.limit), hasMore: rows.length > q.limit };
    }
    if (key === 'categories') await this.access.require(user, 'products.read');
    else if (key === 'gardeners') await this.access.require(user, 'bookings.update');
    else throw new NotFoundException('Unknown lookup.');
    const rows =
      key === 'categories'
        ? await this.db.category.findMany({
            where: {
              active: true,
              ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
            },
            select: { id: true, name: true },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            skip: (q.page - 1) * q.limit,
            take: q.limit + 1,
          })
        : await this.db.gardener.findMany({
            where: {
              active: true,
              verified: true,
              profileComplete: true,
              ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
            },
            select: { id: true, name: true, city: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            skip: (q.page - 1) * q.limit,
            take: q.limit + 1,
          });
    return { rows: rows.slice(0, q.limit), hasMore: rows.length > q.limit };
  }
  async dashboard(user: AuthenticatedUser, q: AdminQuery): Promise<unknown> {
    const staff = await this.access.require(user, 'dashboard.read');
    const range = this.range(q);
    const where = { createdAt: range };
    const [
      plants,
      orders,
      bookings,
      ai,
      tickets,
      orderStates,
      gardenerStates,
      outcomes,
      feedback,
      recommendations,
      inventory,
    ] = await this.db.$transaction([
      this.db.gardenPlant.count({ where }),
      this.db.order.count({ where }),
      this.db.serviceBooking.count({ where }),
      this.db.aiMessage.count({ where: { ...where, role: 'ASSISTANT' } }),
      this.db.supportConversation.count({ where }),
      this.db.order.groupBy({ by: ['status'], orderBy: { status: 'asc' }, where, _count: true }),
      this.db.gardener.groupBy({
        by: ['active', 'verified'],
        orderBy: { active: 'asc' },
        _count: true,
      }),
      this.db.plantOutcomeRecord.groupBy({
        by: ['outcome'],
        orderBy: { outcome: 'asc' },
        where: { recordedAt: range },
        _count: true,
      }),
      this.db.aiFeedback.groupBy({
        by: ['helpful'],
        orderBy: { helpful: 'asc' },
        where,
        _count: true,
      }),
      this.db.plantRecommendation.groupBy({
        by: ['status'],
        orderBy: { status: 'asc' },
        where,
        _count: true,
      }),
      this.db.product.aggregate({ where: { active: true }, _count: true, _sum: { stock: true } }),
    ]);
    const customers = await this.db.$queryRaw<
      { total: number; newUsers: number; active30Days: number }[]
    >`SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at >= COALESCE(${q.from ?? null}::timestamptz, '-infinity') AND created_at < COALESCE(${q.to ?? null}::timestamptz, 'infinity'))::int AS "newUsers", count(*) FILTER (WHERE last_sign_in_at >= now() - interval '30 days')::int AS "active30Days" FROM auth.users WHERE COALESCE(raw_app_meta_data->>'role','') <> 'ADMIN'`;
    const finance = permits(staff.role, 'finance.read') ? await this.finance(user, q) : null;
    return {
      checkedAt: new Date(),
      metrics: {
        plants,
        orders,
        bookings,
        aiResponses: ai,
        supportTickets: tickets,
        ...customers[0],
      },
      orderStates,
      gardenerStates,
      outcomes,
      feedback,
      recommendations,
      inventory,
      finance,
      unavailable: [
        'Payment settlement/refunds',
        'Product and service review moderation (no review model)',
        'AI failure telemetry',
        'Inventory reservations',
      ],
    };
  }
  async finance(user: AuthenticatedUser, q: AdminQuery): Promise<unknown> {
    await this.access.require(user, 'finance.read');
    const createdAt = this.range(q);
    const [orders, services, paid, pending, fees] = await this.db.$transaction([
      this.db.order.aggregate({
        where: { createdAt, status: 'DELIVERED' },
        _sum: { total: true, subtotal: true, deliveryFee: true },
        _avg: { total: true },
        _count: true,
      }),
      this.db.serviceBooking.aggregate({
        where: {
          createdAt,
          status: { in: ['COMPLETED', 'CUSTOMER_CONFIRMED', 'OUTCOME_RECORDED'] },
        },
        _sum: { price: true },
        _count: true,
      }),
      this.db.gardenerPayout.aggregate({
        where: { paidAt: createdAt, status: 'PAID' },
        _sum: { net: true },
      }),
      this.db.gardenerPayout.aggregate({
        where: { createdAt, status: 'PENDING' },
        _sum: { net: true },
      }),
      this.db.gardenerPayout.aggregate({ where: { createdAt }, _sum: { platformFee: true } }),
    ]);
    return {
      deliveredOrderValue: orders._sum.total ?? 0,
      productValue: orders._sum.subtotal ?? 0,
      deliveryFees: orders._sum.deliveryFee ?? 0,
      averageDeliveredOrderValue: orders._avg.total ?? 0,
      deliveredOrders: orders._count,
      completedServiceValue: services._sum.price ?? 0,
      recordedPaidPayouts: paid._sum.net ?? 0,
      pendingPayouts: pending._sum.net ?? 0,
      configuredCommission: fees._sum.platformFee ?? 0,
      refunds: null,
      settledRevenue: null,
      note: 'Order/service values use creation date. Paid payouts use payment date. Values are not payment settlement; refunds are not integrated.',
    };
  }
  private resource(key: string): (typeof resources)[Resource] {
    const r = Object.hasOwn(resources, key) ? resources[key as Resource] : undefined;
    if (!r) throw new NotFoundException('Unknown admin section.');
    return r;
  }
  private statuses(key: string): string[] {
    if (key === 'inventory') return ['LOW', 'OUT'];
    if (key === 'payouts') return ['PENDING', 'PAID'];
    if (key === 'notifications') return ['DRAFT', 'SENT', 'CANCELLED'];
    const resource = this.resource(key);
    if (!('status' in resource)) return [];
    const model = Prisma.dmmf.datamodel.models.find(
      (m) => m.name.toLowerCase() === resource.model.toLowerCase(),
    );
    const field = model?.fields.find((f) => f.name === resource.status);
    return (
      Prisma.dmmf.datamodel.enums.find((e) => e.name === field?.type)?.values.map((v) => v.name) ??
      []
    );
  }
  private delegate(model: string): Delegate {
    return (this.db as unknown as Record<string, Delegate>)[model]!;
  }
  async list(
    user: AuthenticatedUser,
    key: string,
    q: AdminQuery,
  ): Promise<{
    rows: Row[];
    total: number;
    page: number;
    limit: number;
    columns: readonly string[];
    title: string;
  }> {
    const r = this.resource(key);
    await this.access.require(user, r.permission);
    const dateField = key === 'outcomes' ? 'recordedAt' : 'createdAt';
    const where: Row = { [dateField]: this.range(q) };
    if (key === 'ratings') where.rating = { not: null };
    if (q.search && r.search.length)
      where.OR = r.search.map((field) => ({
        [field]: { contains: q.search, mode: 'insensitive' },
      }));
    if (q.status && !this.statuses(key).includes(q.status))
      throw new BadRequestException('Choose a valid status for this section.');
    if (q.status && 'status' in r) where[r.status] = q.status;
    if (key === 'inventory' && q.status === 'LOW') where.stock = { gt: 0, lte: 5 };
    if (key === 'inventory' && q.status === 'OUT') where.stock = 0;
    const select = Object.fromEntries(
      [key === 'admin-users' ? 'userId' : 'id', ...r.columns].map((k) => [k, true]),
    );
    const delegate = this.delegate(r.model);
    const [rows, total] = await Promise.all([
      delegate.findMany({
        where,
        select,
        orderBy: [{ [dateField]: 'desc' }, { [key === 'admin-users' ? 'userId' : 'id']: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      delegate.count({ where }),
    ]);
    return { rows, total, page: q.page, limit: q.limit, columns: r.columns, title: r.title };
  }
  async detail(user: AuthenticatedUser, key: string, id: string): Promise<unknown> {
    const r = this.resource(key);
    await this.access.require(user, r.permission);
    if (key === 'plants') {
      const plant = await this.db.gardenPlant.findUniqueOrThrow({ where: { id } });
      return this.states.getPlantState(id, plant.userId);
    }
    if (key === 'bookings' || key === 'ratings')
      return this.db.serviceBooking.findUniqueOrThrow({
        where: { id },
        include: {
          service: true,
          gardener: { select: { id: true, name: true } },
          activities: {
            where: { kind: { notIn: ['TRACKING_LOCATION', 'TRACKING_DESTINATION'] } },
            take: 100,
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    if (key === 'orders')
      return this.db.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    if (key === 'support')
      return this.db.supportConversation.findUniqueOrThrow({
        where: { id },
        include: { messages: { take: 100, orderBy: { createdAt: 'desc' } } },
      });
    if (key === 'ai')
      return this.db.aiConversation.findUniqueOrThrow({
        where: { id },
        include: { messages: { take: 50, orderBy: { createdAt: 'desc' } } },
      });
    const row = await this.delegate(r.model).findUnique({
      where: key === 'admin-users' ? { userId: id } : { id },
    });
    if (!row) throw new NotFoundException();
    if (key === 'gardeners') delete row.identityNumber;
    return row;
  }
  async customers(
    user: AuthenticatedUser,
    q: AdminQuery,
  ): Promise<{
    rows: Row[];
    total: number;
    page: number;
    limit: number;
    columns: readonly string[];
    title: string;
  }> {
    await this.access.require(user, 'customers.read');
    this.range(q);
    if (q.status && !['ACTIVE', 'SUSPENDED'].includes(q.status))
      throw new BadRequestException('Choose ACTIVE or SUSPENDED.');
    const search = `%${q.search ?? ''}%`;
    const rows = await this.db.$queryRaw<
      Row[]
    >`SELECT id, email, phone, raw_user_meta_data->>'name' AS name,
      CASE WHEN COALESCE(raw_app_meta_data->>'suspended','false') = 'true' THEN 'SUSPENDED' ELSE 'ACTIVE' END AS status,
      created_at AS "createdAt", last_sign_in_at AS "lastActive" FROM auth.users
      WHERE COALESCE(raw_app_meta_data->>'role','') <> 'ADMIN'
      AND (${q.status ?? ''} = '' OR (COALESCE(raw_app_meta_data->>'suspended','false') = 'true') = ${q.status === 'SUSPENDED'})
      AND created_at >= COALESCE(${q.from ?? null}::timestamptz, '-infinity') AND created_at < COALESCE(${q.to ?? null}::timestamptz, 'infinity') AND (email ILIKE ${search} OR phone ILIKE ${search} OR raw_user_meta_data->>'name' ILIKE ${search} OR id::text ILIKE ${search}) ORDER BY created_at DESC, id DESC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`;
    const count = await this.db.$queryRaw<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM auth.users WHERE COALESCE(raw_app_meta_data->>'role','') <> 'ADMIN'
      AND (${q.status ?? ''} = '' OR (COALESCE(raw_app_meta_data->>'suspended','false') = 'true') = ${q.status === 'SUSPENDED'})
      AND created_at >= COALESCE(${q.from ?? null}::timestamptz, '-infinity') AND created_at < COALESCE(${q.to ?? null}::timestamptz, 'infinity') AND (email ILIKE ${search} OR phone ILIKE ${search} OR raw_user_meta_data->>'name' ILIKE ${search} OR id::text ILIKE ${search})`;
    return {
      rows,
      total: count[0]?.count ?? 0,
      page: q.page,
      limit: q.limit,
      columns: ['name', 'email', 'phone', 'status', 'createdAt', 'lastActive'],
      title: 'Customers',
    };
  }
  async customer(user: AuthenticatedUser, id: string): Promise<unknown> {
    await this.access.require(user, 'customers.read');
    const profile = await customerProfile(this.db, id);
    const [orders, plants, bookings, points, ai, tickets] = await Promise.all([
      this.db.order.aggregate({
        where: { userId: id },
        _sum: { total: true },
        _avg: { total: true },
        _count: true,
      }),
      this.db.gardenPlant.findMany({
        where: { userId: id },
        select: { id: true, name: true, health: true },
        take: 50,
      }),
      this.db.serviceBooking.count({ where: { userId: id } }),
      this.db.rewardTransaction.aggregate({ where: { userId: id }, _sum: { points: true } }),
      this.db.aiConversation.count({ where: { userId: id } }),
      this.db.supportConversation.count({ where: { userId: id } }),
    ]);
    return {
      ...profile,
      orders,
      plants,
      bookings,
      rewardPoints: points._sum.points ?? 0,
      aiConversations: ai,
      supportTickets: tickets,
    };
  }
  private async audit(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    key: string,
    id: string,
    change: AdminChange,
    before: unknown,
    after: unknown,
    action = 'update',
  ): Promise<unknown> {
    return tx.adminAuditLog.create({
      data: {
        actorId: user.id,
        action: `${key}.${action}`,
        entity: key,
        entityId: id,
        reason: change.reason,
        before: json(before),
        after: json(after),
      },
    });
  }
  async change(
    user: AuthenticatedUser,
    key: string,
    id: string,
    change: AdminChange,
  ): Promise<unknown> {
    const v = change.values;
    const reason = text(change.reason, 'Reason', 500);
    change.reason = reason;
    if (!Object.keys(v).length) throw new BadRequestException('No changes supplied.');
    const permission =
      key === 'inventory'
        ? 'inventory.update'
        : key === 'categories'
          ? 'products.update'
          : key === 'admin-users'
            ? 'admin.manage'
            : key === 'orders' && v.status === 'CANCELLED'
              ? 'orders.cancel'
              : key === 'payouts'
                ? 'finance.update'
                : key === 'gardeners' && v.verified !== undefined
                  ? 'gardeners.approve'
                  : key === 'gardeners' && v.active !== undefined
                    ? 'gardeners.suspend'
                    : `${key}.update`;
    await this.access.require(user, permission);
    if (key === 'payouts')
      return this.gardeners.payout(user, id, text(v.reference, 'Payment reference', 200), reason);
    if (key === 'gardeners' && v.verified !== undefined && Object.keys(v).length === 1)
      return this.gardeners.verify(user, id, bool(v.verified, 'Verified'), reason);
    if (key === 'support' && v.message !== undefined)
      return this.support.reply(
        id,
        { message: text(v.message, 'Message', 4000) },
        { actorId: user.id, reason },
      );
    return this.db.$transaction(
      async (tx) => {
        let before: unknown;
        let after: unknown;
        if (key === 'customers') {
          ({ before, after } = await changeCustomer(tx, id, v));
        } else if (key === 'ai-memory') {
          before = await tx.aiUserMemory.findUniqueOrThrow({ where: { id } });
          after = await tx.aiUserMemory.update({ where: { id }, data: memoryData(v) });
        } else if (key === 'categories') {
          before = await tx.category.findUniqueOrThrow({ where: { id } });
          after = await tx.category.update({ where: { id }, data: this.categoryData(v, false) });
        } else if (key === 'bookings' && v.action !== undefined) {
          ({ before, after } = await manageBooking(tx, id, v, user.id, reason));
        } else if (key === 'orders') {
          onlyFields(v, ['status']);
          const row = await tx.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
          before = row;
          const status = text(v.status, 'Status') as OrderStatus;
          if (!orderTransitions[row.status]?.includes(status))
            throw new ConflictException(`Cannot move ${row.status} to ${status}.`);
          const updated = await tx.order.updateMany({
            where: { id, status: row.status },
            data: { status },
          });
          if (!updated.count) throw new ConflictException('Order changed. Refresh and retry.');
          if (status === 'CANCELLED') {
            for (const item of [...row.items].sort((a, b) =>
              a.productId.localeCompare(b.productId),
            ))
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
              });
            const earned = await tx.rewardTransaction.findUnique({
              where: { type_referenceId: { type: 'ORDER_EARN', referenceId: id } },
            });
            if (earned)
              await tx.rewardTransaction.create({
                data: {
                  userId: row.userId,
                  type: 'ORDER_CANCEL',
                  referenceId: id,
                  points: -earned.points,
                  title: `Cancelled order ${row.orderNumber}`,
                },
              });
          }
          after = await tx.order.findUniqueOrThrow({ where: { id } });
        } else if (key === 'products' || key === 'inventory') {
          before = await tx.product.findUniqueOrThrow({ where: { id } });
          if (key === 'inventory') {
            const delta = num(v.adjustment, 'Stock adjustment', -1000000, 1000000);
            if (!Number.isInteger(delta) || delta === 0)
              throw new BadRequestException('Use a nonzero whole-number stock adjustment.');
            const updated = await tx.product.updateMany({
              where: { id, stock: { gte: Math.max(0, -delta) } },
              data: { stock: { increment: delta } },
            });
            if (!updated.count) throw new ConflictException('Stock cannot become negative.');
            after = await tx.product.findUniqueOrThrow({ where: { id } });
          } else {
            const data = this.productData(v, false);
            after = await tx.product.update({ where: { id }, data });
          }
        } else if (key === 'gardeners') {
          before = await tx.gardener.findUniqueOrThrow({ where: { id } });
          after = await tx.gardener.update({
            where: { id },
            data: {
              active: bool(v.active, 'Active'),
              ...(v.active === false ? { available: false } : {}),
            },
          });
        } else if (key === 'services') {
          before = await tx.gardeningService.findUniqueOrThrow({ where: { id } });
          after = await tx.gardeningService.update({
            where: { id },
            data: this.serviceData(v, false),
          });
        } else if (key === 'content') {
          before = await tx.banner.findUniqueOrThrow({ where: { id } });
          after = await tx.banner.update({ where: { id }, data: this.bannerData(v, false) });
        } else if (key === 'support') {
          if (!['OPEN', 'CLOSED'].includes(String(v.status)))
            throw new BadRequestException('Choose OPEN or CLOSED.');
          before = await tx.supportConversation.findUniqueOrThrow({ where: { id } });
          after = await tx.supportConversation.update({
            where: { id },
            data: { status: v.status as SupportConversationStatus },
          });
        } else if (key === 'notifications') {
          const row = await tx.adminNotificationDraft.findUniqueOrThrow({ where: { id } });
          before = row;
          if (row.status !== 'DRAFT')
            throw new ConflictException('This notification is already finalized.');
          const status = text(v.status, 'Status');
          if (!['SENT', 'CANCELLED'].includes(status))
            throw new BadRequestException('Choose SENT or CANCELLED.');
          if (status === 'SENT' && !change.confirmed)
            throw new BadRequestException('Preview and confirm before sending.');
          const updated = await tx.adminNotificationDraft.updateMany({
            where: { id, status: 'DRAFT' },
            data: { status },
          });
          if (!updated.count) throw new ConflictException('Draft changed.');
          if (status === 'SENT')
            await tx.notification.create({
              data: {
                userId: row.userId,
                title: row.title,
                message: row.message,
                type: 'ADMIN_ANNOUNCEMENT',
              },
            });
          after = await tx.adminNotificationDraft.findUniqueOrThrow({ where: { id } });
        } else if (key === 'admin-users') {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('admin-staff',0))::text`;
          const row = await tx.adminStaff.findUniqueOrThrow({ where: { userId: id } });
          before = row;
          const role = v.role === undefined ? row.role : text(v.role, 'Role');
          if (!(adminRoles as readonly string[]).includes(role))
            throw new BadRequestException('Invalid staff role.');
          const active = v.active === undefined ? row.active : bool(v.active, 'Active');
          if (
            row.role === 'SUPER_ADMIN' &&
            row.active &&
            (!active || role !== 'SUPER_ADMIN') &&
            (await tx.adminStaff.count({ where: { role: 'SUPER_ADMIN', active: true } })) <= 1
          )
            throw new ConflictException('Keep at least one active super admin.');
          after = await tx.adminStaff.update({ where: { userId: id }, data: { role, active } });
        } else if (key === 'bookings') {
          onlyFields(v, ['status']);
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('gardener-allocation',0))::text`;
          const row = await tx.serviceBooking.findUniqueOrThrow({ where: { id } });
          before = row;
          if (
            !['REQUESTED', 'GARDENER_ASSIGNED', 'ACCEPTED', 'CONFIRMED'].includes(row.status) ||
            v.status !== 'CANCELLED'
          )
            throw new BadRequestException(
              'Only unstarted bookings can be cancelled here. Rescheduling uses the booking scheduling flow.',
            );
          const updated = await tx.serviceBooking.updateMany({
            where: { id, status: row.status },
            data: { status: BookingStatus.CANCELLED },
          });
          if (!updated.count) throw new ConflictException('Booking changed.');
          await tx.bookingActivity.create({
            data: {
              bookingId: id,
              actorId: user.id,
              requestId: crypto.randomUUID(),
              kind: 'cancel',
              data: json({
                input: { note: reason },
                from: row.status,
                to: 'CANCELLED',
                source: 'ADMIN',
              }),
            },
          });
          after = await tx.serviceBooking.findUniqueOrThrow({ where: { id } });
        } else throw new BadRequestException('This section is read-only.');
        await this.audit(tx, user, key, id, change, before, after);
        return after;
      },
      { timeout: 20000 },
    );
  }
  private categoryData(v: Row, create: boolean): Prisma.CategoryUpdateInput {
    onlyFields(v, ['name', 'slug', 'active', 'sortOrder']);
    const data: Prisma.CategoryUpdateInput = {};
    for (const key of ['name', 'slug'] as const)
      if (create || v[key] !== undefined) data[key] = text(v[key], key, 150);
    if (v.active !== undefined) data.active = bool(v.active, 'Active');
    if (v.sortOrder !== undefined) {
      const value = num(v.sortOrder, 'Sort order', 0, 10000);
      if (!Number.isInteger(value))
        throw new BadRequestException('Sort order must be a whole number.');
      data.sortOrder = value;
    }
    return data;
  }
  private productData(v: Row, create: boolean): Prisma.ProductUncheckedUpdateInput {
    const data: Prisma.ProductUncheckedUpdateInput = {};
    for (const key of [
      'name',
      'slug',
      'description',
      'scientificName',
      'light',
      'water',
      'difficulty',
      'height',
    ] as const)
      if (v[key] !== undefined || (create && ['name', 'slug', 'description'].includes(key)))
        data[key] = text(v[key], key);
    if (v.price !== undefined || create) data.price = num(v.price, 'Price');
    if (v.salePrice !== undefined)
      data.salePrice = v.salePrice === null ? null : num(v.salePrice, 'Sale price');
    if (v.categoryId !== undefined || create) data.categoryId = uuid(v.categoryId);
    for (const key of ['active', 'featured', 'petSafe'] as const)
      if (v[key] !== undefined) data[key] = bool(v[key], key);
    if (v.images !== undefined || create) {
      if (
        !Array.isArray(v.images) ||
        v.images.length > 10 ||
        v.images.some((url) => typeof url !== 'string' || !/^https:\/\//.test(url))
      )
        throw new BadRequestException('Images must be HTTPS URLs (up to 10).');
      data.images = v.images as string[];
    }
    return data;
  }
  private serviceData(v: Row, create: boolean): Prisma.GardeningServiceUpdateInput {
    const data: Prisma.GardeningServiceUpdateInput = {};
    for (const key of ['title', 'slug', 'description', 'category', 'icon'] as const)
      if (v[key] !== undefined || create) data[key] = text(v[key], key);
    if (v.price !== undefined || create) data.price = num(v.price, 'Price');
    if (v.durationMinutes !== undefined || create) {
      const n = num(v.durationMinutes, 'Duration', 1, 1440);
      if (!Number.isInteger(n)) throw new BadRequestException('Duration must be whole minutes.');
      data.durationMinutes = n;
    }
    if (v.commissionBps !== undefined) {
      const n = num(v.commissionBps, 'Commission basis points', 0, 10000);
      if (!Number.isInteger(n))
        throw new BadRequestException('Commission must be whole basis points.');
      data.commissionBps = n;
    }
    if (v.active !== undefined) data.active = bool(v.active, 'Active');
    if (v.inclusions !== undefined) {
      if (!Array.isArray(v.inclusions) || v.inclusions.some((x) => typeof x !== 'string'))
        throw new BadRequestException('Inclusions must be text entries.');
      data.inclusions = v.inclusions as string[];
    }
    return data;
  }
  private bannerData(v: Row, create: boolean): Prisma.BannerUpdateInput {
    const data: Prisma.BannerUpdateInput = {};
    for (const key of ['title', 'slug', 'placement', 'imageUrl', 'eyebrow', 'route'] as const)
      if (
        v[key] !== undefined ||
        (create && ['title', 'slug', 'placement', 'imageUrl'].includes(key))
      )
        data[key] = text(v[key], key);
    if (typeof data.imageUrl === 'string' && !data.imageUrl.startsWith('https://'))
      throw new BadRequestException('Image URL must use HTTPS.');
    if (
      typeof data.route === 'string' &&
      (!data.route.startsWith('/') || data.route.startsWith('//'))
    )
      throw new BadRequestException('Use an internal app route.');
    if (v.active !== undefined) data.active = bool(v.active, 'Active');
    if (v.sortOrder !== undefined)
      data.sortOrder = Math.trunc(num(v.sortOrder, 'Sort order', 0, 10000));
    return data;
  }
  async create(user: AuthenticatedUser, key: string, change: AdminChange): Promise<unknown> {
    change.reason = requiredText(change.reason, 'Reason', 500);
    if (change.reason.length < 3)
      throw new BadRequestException('Reason must contain at least three characters.');
    await this.access.require(
      user,
      key === 'admin-users'
        ? 'admin.manage'
        : key === 'categories'
          ? 'products.update'
          : key === 'products'
            ? 'products.create'
            : `${key}.update`,
    );
    return this.db.$transaction(async (tx) => {
      const v = change.values;
      if (key === 'admin-users') {
        if (!change.confirmed) throw new BadRequestException('Confirm granting staff access.');
        const staff = await addStaff(tx, v);
        await this.audit(tx, user, key, staff.userId, change, null, staff, 'create');
        return staff;
      }
      if (key === 'rewards') {
        const result = await adjustRewards(tx, v);
        if (!result.replay)
          await this.audit(tx, user, key, result.row.id, change, null, result.row, 'create');
        return result.row;
      }
      let row: { id: string };
      if (key === 'categories')
        row = await tx.category.create({
          data: this.categoryData(v, true) as Prisma.CategoryCreateInput,
        });
      else if (key === 'products')
        row = await tx.product.create({
          data: this.productData(v, true) as Prisma.ProductUncheckedCreateInput,
        });
      else if (key === 'services')
        row = await tx.gardeningService.create({
          data: this.serviceData(v, true) as Prisma.GardeningServiceCreateInput,
        });
      else if (key === 'content')
        row = await tx.banner.create({
          data: this.bannerData(v, true) as Prisma.BannerCreateInput,
        });
      else if (key === 'notifications') {
        await customerProfile(tx, uuid(v.userId));
        row = await tx.adminNotificationDraft.create({
          data: {
            title: text(v.title, 'Title', 150),
            message: text(v.message, 'Message', 2000),
            userId: uuid(v.userId),
            createdBy: user.id,
          },
        });
      } else throw new BadRequestException('Creation is unavailable for this section.');
      await this.audit(tx, user, key, row.id, change, null, row, 'create');
      return row;
    });
  }
  async export(
    user: AuthenticatedUser,
    key: string,
    q: AdminQuery,
  ): Promise<{ csv: string; total: number; page: number; limit: number }> {
    await this.access.require(user, 'reports.export');
    if (q.scope === 'all') {
      return this.db.$transaction(
        async (tx) => {
          const reader = new AdminService(
            tx as PrismaService,
            this.access,
            this.states,
            this.gardeners,
            this.support,
          );
          const read = (page: number): ReturnType<AdminService['list']> =>
            key === 'customers'
              ? reader.customers(user, { ...q, page, limit: 100 })
              : reader.list(user, key, { ...q, page, limit: 100 });
          const first = await read(1);
          if (first.total > 10000)
            throw new BadRequestException(
              'Narrow the filters to 10,000 records or fewer before exporting.',
            );
          const lines = [first.columns.map(csvCell).join(',')];
          const append = (rows: Row[]): number =>
            lines.push(
              ...rows.map((row) => first.columns.map((col) => csvCell(row[col])).join(',')),
            );
          append(first.rows);
          for (let page = 2; page <= Math.ceil(first.total / 100); page++)
            append((await read(page)).rows);
          await tx.adminAuditLog.create({
            data: {
              actorId: user.id,
              action: 'export',
              entity: key,
              entityId: 'all',
              reason: 'Exported all filtered records',
              after: json({ count: first.total, query: q }),
            },
          });
          return { csv: lines.join('\r\n'), total: first.total, page: 1, limit: first.total };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 },
      );
    }
    const result =
      key === 'customers' ? await this.customers(user, q) : await this.list(user, key, q);
    await this.db.adminAuditLog.create({
      data: {
        actorId: user.id,
        action: 'export',
        entity: key,
        entityId: `page:${q.page}`,
        reason: 'Exported filtered page',
        after: json({ count: result.rows.length, query: q }),
      },
    });
    return {
      csv: [
        result.columns.map(csvCell).join(','),
        ...result.rows.map((row) => result.columns.map((col) => csvCell(row[col])).join(',')),
      ].join('\r\n'),
      total: result.total,
      page: q.page,
      limit: q.limit,
    };
  }
  async health(user: AuthenticatedUser): Promise<unknown> {
    await this.access.require(user, 'system.read');
    const started = Date.now();
    let database = 'ONLINE';
    try {
      await this.db.$queryRaw`SELECT 1`;
    } catch {
      database = 'OFFLINE';
    }
    return {
      checkedAt: new Date(),
      backend: 'ONLINE',
      database,
      responseMs: Date.now() - started,
      supabaseAuth: 'Authenticated this request',
      gemini: 'Not checked',
      storage: 'Not checked',
      notifications: 'No health telemetry',
      orders: 'No health telemetry',
      bookings: 'No health telemetry',
      aiMemory: 'No health telemetry',
      recentFailures: null,
    };
  }
}
