import type { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { SupabaseAuthGuard } from '../../src/common/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../../src/common/auth/authenticated-user';

const collections = [
  ['orders', 'order'],
  ['notifications', 'notification'],
  ['addresses', 'address'],
  ['wishlist', 'wishlistItem'],
  ['garden/plants', 'gardenPlant'],
  ['services', 'gardeningService'],
  ['bookings', 'serviceBooking'],
  ['spaces', 'space'],
  ['ai/conversations', 'aiConversation'],
  ['ai/memories', 'aiUserMemory'],
  ['support/conversations', 'supportConversation'],
  ['rewards/transactions', 'rewardTransaction'],
  ['rewards/redemptions', 'rewardRedemption'],
] as const;
describe('Paginated list HTTP contracts', () => {
  let app: INestApplication;
  const db = Object.fromEntries(
    collections.map(([, model]) => [
      model,
      {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(5),
        findFirst: jest.fn().mockResolvedValue(null),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    ]),
  );
  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/greennest',
      DIRECT_URL: 'postgresql://postgres:postgres@localhost:5432/greennest',
      WEB_APP_ORIGIN: 'http://localhost:3001',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_for_contracts',
      DATABASE_CONNECT_ON_STARTUP: 'false',
    });
    const [{ Test }, { AppModule }, { setupApp }] = await Promise.all([
      import('@nestjs/testing'),
      import('../../src/app.module'),
      import('../../src/setup-app'),
    ]);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideGuard(SupabaseAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<AuthenticatedRequest>().authUser = {
            id: 'owner',
            email: null,
            phone: null,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app?.close());
  it.each(collections)(
    '%s uses bounded database reads and matching filtered counts',
    async (path, model) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/${path}?page=2&limit=2&search=plant`)
        .expect(200);
      expect(response.body.data).toEqual({
        items: [],
        meta: {
          page: 2,
          limit: 2,
          total: 5,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: true,
        },
      });
      const args = db[model]!.findMany.mock.calls[0]![0] as {
        where: Record<string, unknown>;
        skip: number;
        take: number;
        orderBy: unknown[];
      };
      expect(args).toMatchObject({ skip: 2, take: 2 });
      expect(args.orderBy.at(-1)).toEqual({ id: 'asc' });
      expect(db[model]!.count).toHaveBeenCalledWith({ where: args.where });
      if (path !== 'services') expect(args.where.userId).toBe('owner');
    },
  );
  it.each([
    'page=0',
    'page=-1',
    'page=1.5',
    'page=100001',
    'limit=0',
    'limit=101',
    'limit=no',
    'sort=random',
    'from=not-a-date',
    'status=UNKNOWN',
    'userId=other',
  ])('rejects invalid parameters: %s', async (query) => {
    await request(app.getHttpServer()).get(`/api/v1/orders?${query}`).expect(400);
    expect(db.order!.findMany).not.toHaveBeenCalled();
  });
  it('returns whole-garden counts and location choices independently of the loaded page', async () => {
    db.gardenPlant!.groupBy.mockResolvedValueOnce([
      { location: 'Balcony', _count: { _all: 4 } },
      { location: 'Room', _count: { _all: 6 } },
    ]);
    const response = await request(app.getHttpServer())
      .get('/api/v1/garden/plants/summary')
      .expect(200);
    expect(response.body.data).toEqual({ total: 10, healthy: 5, locations: ['Balcony', 'Room'] });
    expect(db.gardenPlant!.count.mock.calls.at(-1)![0]).toMatchObject({
      where: { userId: 'owner', health: { gte: 80 } },
    });
  });
  it('rejects reversed date ranges before querying the database', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/orders?from=2026-09-20&to=2026-09-01')
      .expect(400);
    expect(db.order!.findMany).not.toHaveBeenCalled();
  });
  it('applies order status, search, inclusive dates and sort before paging', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/orders?status=ACTIVE&search=rose&from=2026-09-01&to=2026-09-02&sort=oldest')
      .expect(200);
    expect(db.order!.findMany.mock.calls[0]![0]).toMatchObject({
      take: 20,
      skip: 0,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: {
        userId: 'owner',
        status: { notIn: ['DELIVERED', 'CANCELLED'] },
        createdAt: { gte: new Date('2026-09-01'), lte: new Date('2026-09-02T23:59:59.999Z') },
        OR: [
          { orderNumber: { contains: 'rose', mode: 'insensitive' } },
          { items: { some: { productName: { contains: 'rose', mode: 'insensitive' } } } },
        ],
      },
    });
  });
  it('distinguishes read=false from an omitted filter', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications?unread=false').expect(200);
    expect(db.notification!.findMany.mock.calls.at(-1)![0]).toMatchObject({
      where: { readAt: { not: null } },
    });
    await request(app.getHttpServer()).get('/api/v1/notifications?unread=true').expect(200);
    expect(db.notification!.findMany.mock.calls.at(-1)![0]).toMatchObject({
      where: { readAt: null },
    });
    await request(app.getHttpServer()).get('/api/v1/notifications?unread=invalid').expect(400);
  });
  it.each(['ai', 'support'])(
    'checks %s conversation ownership before message reads',
    async (path) => {
      await request(app.getHttpServer())
        .get(`/api/v1/${path}/conversations/other/messages?page=1`)
        .expect(404);
      expect(db[`${path}Conversation`]!.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'other', userId: 'owner' } }),
      );
    },
  );
});
