import type { PrismaService } from '../../database/prisma.service';
import type { AiResponseService } from '../ai/ai-response.service';
import { SpacesService } from './spaces.service';

describe('SpacesService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const photoPath = `${userId}/spaces/room.jpg`;
  const imageUrl = `https://example.supabase.co/storage/v1/object/sign/space-photos/${photoPath}?token=signed`;

  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
  });

  it('rejects another user photo path before writing', async () => {
    const spaceCreate = jest.fn();
    const prisma = { space: { create: spaceCreate } } as unknown as PrismaService;
    const ai = { analyzeSpace: jest.fn() } as unknown as AiResponseService;
    const service = new SpacesService(prisma, ai);

    await expect(
      service.analyze(userId, {
        photoPath: '22222222-2222-4222-8222-222222222222/spaces/room.jpg',
        imageUrl,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(spaceCreate).not.toHaveBeenCalled();
  });

  it('rejects a signed-looking URL from another host before writing', async () => {
    const spaceCreate = jest.fn();
    const prisma = { space: { create: spaceCreate } } as unknown as PrismaService;
    const ai = { analyzeSpace: jest.fn() } as unknown as AiResponseService;
    const service = new SpacesService(prisma, ai);

    await expect(
      service.analyze(userId, {
        photoPath,
        imageUrl: `https://attacker.example/storage/v1/object/sign/space-photos/${photoPath}?token=signed`,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(spaceCreate).not.toHaveBeenCalled();
  });

  it('persists the normalized scene and completion event together', async () => {
    const completed = { id: 'space-1', analysisStatus: 'COMPLETED', scene: { id: 'scene-1' } };
    const sceneCreate = jest
      .fn<Promise<{ id: string }>, [unknown]>()
      .mockResolvedValue({ id: 'scene-1' });
    const eventCreate = jest
      .fn<Promise<{ id: string }>, [unknown]>()
      .mockResolvedValue({ id: 'event-1' });
    const tx = {
      spaceScene: { create: sceneCreate },
      engagementEvent: { create: eventCreate },
      space: { update: jest.fn().mockResolvedValue(completed) },
    };
    const prisma = {
      space: {
        create: jest.fn().mockResolvedValue({ id: 'space-1' }),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const ai = {
      analyzeSpace: jest.fn().mockResolvedValue({
        spaceType: 'BEDROOM',
        environment: 'INDOOR',
        proportions: { shape: 'BALANCED', description: 'Room', confidence: 0.8 },
        objects: [],
        surfaces: [],
        environmentEstimate: {
          naturalLight: 'MEDIUM',
          directSunlightPossible: false,
          indirectLight: 'MEDIUM',
          ventilation: 'UNKNOWN',
          windowProximity: 'MODERATE',
          basis: 'One window is visible.',
          confidence: 0.7,
        },
        placementZones: [],
        confidence: 0.75,
        warnings: ['Estimated from one photo.'],
        analysisModel: 'gemini-test',
      }),
    } as unknown as AiResponseService;
    const service = new SpacesService(prisma, ai);

    await expect(service.analyze(userId, { photoPath, imageUrl })).resolves.toBe(completed);
    expect(sceneCreate).toHaveBeenCalled();
    const eventArgument: unknown = eventCreate.mock.calls[0]?.[0];
    expect(eventArgument).toMatchObject({
      data: { name: 'space_analysis_completed' },
    });
  });

  it('marks the saved analysis as failed when AI analysis fails', async () => {
    const failure = new Error('provider failure');
    const spaceUpdate = jest.fn().mockResolvedValue({ id: 'space-1' });
    const prisma = {
      space: {
        create: jest.fn().mockResolvedValue({ id: 'space-1' }),
        update: spaceUpdate,
      },
    } as unknown as PrismaService;
    const ai = {
      analyzeSpace: jest.fn().mockRejectedValue(failure),
    } as unknown as AiResponseService;
    const service = new SpacesService(prisma, ai);

    await expect(service.analyze(userId, { photoPath, imageUrl })).rejects.toBe(failure);
    expect(spaceUpdate).toHaveBeenCalledWith({
      where: { id: 'space-1' },
      data: {
        analysisStatus: 'FAILED',
        analysisError: 'AI_ANALYSIS_FAILED',
      },
    });
  });
});
