import {
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminController } from '../../src/modules/admin/admin.controller';
import { AdminService } from '../../src/modules/admin/admin.service';
import { AdminAccessService } from '../../src/modules/admin/admin-access.service';
import { SupabaseAuthGuard } from '../../src/common/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../../src/common/auth/authenticated-user';
import { setupApp } from '../../src/setup-app';

describe('Admin HTTP contracts', () => {
  let app: INestApplication;
  const id = '00000000-0000-4000-8000-000000000001';
  let role = 'SUPER_ADMIN';
  const audit = jest.fn().mockResolvedValue({ id });
  const create = jest.fn(({ data }: { data: object }) => Promise.resolve({ id, ...data }));
  const db = {
    adminStaff: {
      findUnique: jest.fn(() =>
        Promise.resolve({ userId: id, role, active: true, email: 'staff@example.test' }),
      ),
    },
    category: {
      create,
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    adminAuditLog: { create: audit },
    $transaction: (fn: (tx: unknown) => unknown): unknown => fn(db),
  };
  beforeAll(async () => {
    const access = new AdminAccessService(db as never);
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: ConfigService, useValue: new ConfigService({}) },
        {
          provide: AdminService,
          useValue: new AdminService(db as never, access, {} as never, {} as never, {} as never),
        },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext): boolean => {
          const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
          if (!req.headers.authorization) throw new UnauthorizedException();
          req.authUser = {
            id,
            email: 'staff@example.test',
            phone: null,
            role: req.headers.authorization === 'customer' ? undefined : 'ADMIN',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });
  beforeEach(() => {
    role = 'SUPER_ADMIN';
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app.close();
  });
  it('rejects anonymous and customer access', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/me')
      .set('Authorization', 'customer')
      .expect(403);
  });
  it('publishes real status options for the frontend', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/me')
      .set('Authorization', 'admin')
      .expect(200);
    expect(response.body.data.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'orders',
          statuses: expect.arrayContaining(['PLACED', 'DELIVERED']) as unknown,
        }),
      ]),
    );
  });
  it('creates a category with an audit entry through the validated HTTP contract', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', 'admin')
      .send({ reason: 'New category', values: { name: 'Herbs', slug: 'herbs', active: true } })
      .expect(201);
    expect(create).toHaveBeenCalledWith({ data: { name: 'Herbs', slug: 'herbs', active: true } });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'categories.create', entityId: id }) as unknown,
      }),
    );
  });
  it('validates inputs before any mutation and rejects read-only staff writes', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', 'admin')
      .send({ reason: 'x', values: { name: 'Herbs' } })
      .expect(400);
    role = 'SUPPORT_ADMIN';
    await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', 'admin')
      .send({ reason: 'New category', values: { name: 'Herbs', slug: 'herbs' } })
      .expect(403);
    expect(create).not.toHaveBeenCalled();
  });
  it('requires staff confirmation and rejects malformed resource filters', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/admin-users')
      .set('Authorization', 'admin')
      .send({ reason: 'New staff', values: { email: 'new@example.test', role: 'SUPPORT_ADMIN' } })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/admin/categories?status=INVALID')
      .set('Authorization', 'admin')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/admin/toString')
      .set('Authorization', 'admin')
      .expect(404);
    expect(audit).not.toHaveBeenCalled();
  });
});
