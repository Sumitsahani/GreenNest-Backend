import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

describe('Spaces API contract', () => {
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('protects saved space data behind authentication', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/spaces').expect(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('protects space analysis behind authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/spaces/analyze')
      .send({ photoPath: 'fake/spaces/photo.jpg', imageUrl: 'https://example.com/photo.jpg' })
      .expect(401);
  });
});
