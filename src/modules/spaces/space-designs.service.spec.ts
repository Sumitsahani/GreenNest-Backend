import type { PrismaService } from '../../database/prisma.service';
import { SpaceDesignsService } from './space-designs.service';
import type { CreateDesignDto } from './dto/designs.dto';

describe('SpaceDesignsService ownership and retry safety', () => {
  const dto: CreateDesignDto = {
    requestId: 'request-1',
    title: 'My room',
    style: 'MINIMAL',
    carePreference: 'EASY',
    recommendationIds: ['match-1'],
  };
  const setup = (): {
    db: {
      space: { findFirst: jest.Mock };
      spaceDesign: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
      spacePlantRecommendation: { findMany: jest.Mock };
      $transaction: jest.Mock;
    };
    service: SpaceDesignsService;
  } => {
    const db = {
      space: { findFirst: jest.fn().mockResolvedValue(null) },
      spaceDesign: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
      },
      spacePlantRecommendation: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    return { db, service: new SpaceDesignsService(db as unknown as PrismaService) };
  };
  it('checks space ownership before reading retries or plant data', async () => {
    const { db, service } = setup();
    await expect(service.create('other-user', 'space-1', dto)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(db.space.findFirst).toHaveBeenCalledWith({
      where: { id: 'space-1', userId: 'other-user' },
      include: { scene: true },
    });
    expect(db.spaceDesign.findUnique).not.toHaveBeenCalled();
  });
  it('rejects stale or foreign recommendations without writing a design', async () => {
    const { db, service } = setup();
    db.space.findFirst.mockResolvedValue({ analysisStatus: 'COMPLETED', scene: {} });
    await expect(service.create('owner', 'space-1', dto)).rejects.toThrow(
      'suggestions have changed',
    );
    expect(db.spacePlantRecommendation.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['match-1'] },
        spaceId: 'space-1',
        style: 'MINIMAL',
        carePreference: 'EASY',
      },
      include: { product: true },
      orderBy: { rank: 'asc' },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects reuse of a request identifier for different input', async () => {
    const { db, service } = setup();
    db.space.findFirst.mockResolvedValue({});
    db.spaceDesign.findUnique.mockResolvedValue({ requestHash: 'different-input' });
    await expect(service.create('owner', 'space-1', dto)).rejects.toThrow('changed design');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('scopes design detail to both the user and the parent space', async () => {
    const { db, service } = setup();
    await expect(service.detail('other-user', 'space-1', 'design-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(db.spaceDesign.findFirst).toHaveBeenCalledWith({
      where: { id: 'design-1', spaceId: 'space-1', space: { userId: 'other-user' } },
    });
  });
});
