import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AuthenticatedRequest } from '../../src/common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../src/common/auth/supabase-auth.guard';
import { SpaceDesignsService } from '../../src/modules/spaces/space-designs.service';
import { DesignImagesService } from '../../src/modules/spaces/design-images.service';
import { SpacesController } from '../../src/modules/spaces/spaces.controller';
import { SpacesService } from '../../src/modules/spaces/spaces.service';
import { PlantMatchingService } from '../../src/modules/spaces/plant-matching.service';
import { setupApp } from '../../src/setup-app';

describe('Design HTTP validation and authenticated user forwarding', () => {
  let app: INestApplication;
  const userId = '11111111-1111-4111-8111-111111111111';
  const spaceId = '22222222-2222-4222-8222-222222222222';
  const matchId = '33333333-3333-4333-8333-333333333333';
  const path = `/api/v1/spaces/${spaceId}/designs`;
  const input = {
    requestId: '44444444-4444-4444-8444-444444444444',
    title: ' My space ',
    style: 'MINIMAL',
    carePreference: 'EASY',
    recommendationIds: [matchId],
  };
  const create = jest.fn().mockResolvedValue({ id: 'saved', scene: { plants: [] } });
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SpacesController],
      providers: [
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: SpacesService, useValue: {} },
        { provide: PlantMatchingService, useValue: {} },
        { provide: SpaceDesignsService, useValue: { create } },
        { provide: DesignImagesService, useValue: {} },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext): boolean => {
          context.switchToHttp().getRequest<AuthenticatedRequest>().authUser = {
            id: userId,
            email: null,
            phone: null,
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => create.mockClear());
  it('trims names and passes the authenticated owner to the service', async () => {
    await request(app.getHttpServer()).post(path).send(input).expect(201);
    expect(create).toHaveBeenCalledWith(userId, spaceId, { ...input, title: 'My space' });
  });
  it.each([
    { recommendationIds: [] },
    { recommendationIds: [matchId, matchId] },
    { requestId: 'not-a-uuid' },
    { title: '   ' },
    { title: 'x'.repeat(81) },
    { style: 'FAKE' },
    { userId: 'injected-user' },
    { scene: { plants: [] } },
  ])('rejects invalid or client-injected fields: %p', async (invalid) => {
    await request(app.getHttpServer())
      .post(path)
      .send({ ...input, ...invalid })
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects malformed parent IDs before querying the database', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/spaces/not-a-uuid/designs')
      .send(input)
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });
});
