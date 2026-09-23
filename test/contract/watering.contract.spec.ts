import type { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { SupabaseAuthGuard } from '../../src/common/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../../src/common/auth/authenticated-user';

describe('Watering HTTP contract', () => {
  let app: INestApplication;
  const id = '00000000-0000-4000-8000-000000000001';
  const plant = {
    id,
    userId: 'u',
    name: 'Pothos',
    wateringDays: 7,
    lastWateredAt: new Date(),
    nextWateringAt: new Date(),
    environment: 'INDOOR',
    location: 'Room',
    latitude: null,
    longitude: null,
    weatherLocation: null,
    health: 100,
    careEvents: [],
    events: [] as Array<Record<string, unknown>>,
    memories: [],
    outcomes: [],
    reminders: [],
  };
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
      .useValue({
        gardenPlant: {
          findFirst: jest.fn(({ where }: { where: { id: string; userId: string } }) =>
            where.id === id && where.userId === 'u' ? plant : null,
          ),
        },
        plantEvent: {
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            const event = { ...data, occurredAt: new Date() };
            plant.events.unshift(event);
            return event;
          }),
        },
      })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<AuthenticatedRequest>().authUser = {
            id: 'u',
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
  afterAll(async () => {
    await app.close();
  });
  it('validates corrections and recalculates the served state from saved evidence', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/garden/plants/${id}/watering/correction`)
      .send({ dryingDays: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/garden/plants/${id}/watering/correction`)
      .send({ dryingDays: 12, soilState: 'WET' })
      .expect(201);
    const result = await request(app.getHttpServer())
      .get(`/api/v1/garden/plants/${id}/watering-state`)
      .expect(200);
    expect(result.body.data).toMatchObject({ wateringStatus: 'SKIP', soilState: 'WET' });
    expect(result.body.data.currentEstimatedIntervalDays).toBeGreaterThan(7);
  });
  it('rejects corrections for plants outside the owned garden', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/garden/plants/other/watering/correction')
      .send({ dryingDays: 7 })
      .expect(404);
  });
});
