import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

describe('Health API contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/greennest';
    process.env.DIRECT_URL = 'postgresql://postgres:postgres@localhost:5432/greennest';
    process.env.WEB_APP_ORIGIN = 'http://localhost:3001';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key_for_contracts';
    process.env.DATABASE_CONNECT_ON_STARTUP = 'false';
    const [{ Test }, { AppModule }, { setupApp }] = await Promise.all([
      import('@nestjs/testing'),
      import('../../src/app.module'),
      import('../../src/setup-app'),
    ]);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the standard success envelope and request ID', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.headers['x-request-id']).toEqual(expect.stringMatching(/^req_/));
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'ok',
        service: 'greennest-api',
        version: '1.0.0',
        database: 'not-connected',
      },
    });
  });

  it('preserves a client-provided request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-ID', 'req_frontend_123')
      .expect(200);
    expect(response.headers['x-request-id']).toBe('req_frontend_123');
  });

  it('returns the standard business error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/unknown-component')
      .expect(404);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested component was not found',
        field: 'component',
        details: { component: 'unknown-component' },
      },
    });
    expect(response.body.error.requestId).toEqual(expect.stringMatching(/^req_/));
  });
});
