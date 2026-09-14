import type { PrismaService } from '../../database/prisma.service';
import { DesignImagesService } from './design-images.service';
import { DesignImageStorage } from './design-image-storage';

describe('DesignImagesService', () => {
  const scene = { schemaVersion: 1, plants: [{ boundingBox: [0.1, 0.2, 0.3, 0.4] }] };
  const saved = { id: 'design', scene, space: { photoPath: 'owner/spaces/room.jpg' } };
  const findFirst = jest.fn();
  const updateMany = jest.fn<Promise<{ count: number }>, [unknown]>();
  const generate = jest.fn();
  const load = jest.fn();
  const save = jest.fn();
  const sign = jest.fn();
  const service = new DesignImagesService(
    { spaceDesign: { findFirst, updateMany } } as unknown as PrismaService,
    { generate },
    { load, save, sign } as unknown as DesignImageStorage,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    findFirst.mockResolvedValue(saved);
    updateMany.mockResolvedValue({ count: 1 });
    load.mockResolvedValue({ data: 'original', mime_type: 'image/jpeg' });
    generate.mockResolvedValue({ data: 'generated', mime_type: 'image/png', model: 'test-model' });
    sign.mockResolvedValue('https://example.com/private-signed-photo');
  });
  it('checks ownership before photo download or generation', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      service.generate('outsider', 'space', 'design', 'Bearer token'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'design', spaceId: 'space', space: { userId: 'outsider' } },
      include: { space: true },
    });
    expect(load).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it('saves real output privately and adds only render metadata to the scene', async () => {
    const result = await service.generate('owner', 'space', 'design', 'Bearer token');
    expect(result.status).toBe('READY');
    expect(save).toHaveBeenCalledWith(
      expect.stringMatching(/^owner\/spaces\/designs\/design\/.*\.png$/),
      { data: 'generated', mime_type: 'image/png', model: 'test-model' },
      'Bearer token',
    );
    expect(updateMany.mock.calls[0]?.[0]).toMatchObject({ where: { scene: { equals: scene } } });
    expect(updateMany.mock.calls[1]?.[0]).toMatchObject({
      data: { scene: { ...scene, render: { status: 'READY', model: 'test-model' } } },
    });
  });
  it('returns an existing image without paying for another generation', async () => {
    findFirst.mockResolvedValue({
      ...saved,
      scene: {
        ...scene,
        render: { status: 'READY', path: 'owner/spaces/designs/design/saved.png' },
      },
    });
    expect((await service.generate('owner', 'space', 'design', 'Bearer token')).status).toBe(
      'READY',
    );
    expect(generate).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('does not start a second request while a generation is in progress', async () => {
    findFirst.mockResolvedValue({
      ...saved,
      scene: { ...scene, render: { status: 'GENERATING', startedAt: new Date().toISOString() } },
    });
    expect((await service.generate('owner', 'space', 'design', 'Bearer token')).status).toBe(
      'GENERATING',
    );
    expect(generate).not.toHaveBeenCalled();
  });
  it('records failures and never substitutes a diagram for a generated photo', async () => {
    generate.mockRejectedValue(new Error('secret provider error'));
    await expect(service.generate('owner', 'space', 'design', 'Bearer token')).rejects.toThrow(
      'The image could not be created',
    );
    expect(save).not.toHaveBeenCalled();
    expect(updateMany.mock.calls[1]?.[0]).toMatchObject({
      data: {
        scene: {
          render: { status: 'FAILED', error: 'The image could not be created. Please try again.' },
        },
      },
    });
  });
  it('requires known plant coordinates and allows recovery from a dead process', async () => {
    findFirst.mockResolvedValue({ ...saved, scene: { ...scene, plants: [{ boundingBox: null }] } });
    await expect(service.generate('owner', 'space', 'design', 'Bearer token')).rejects.toThrow(
      'positions are unclear',
    );
    findFirst.mockResolvedValue({
      ...saved,
      scene: {
        ...scene,
        render: { status: 'GENERATING', startedAt: new Date(Date.now() - 360000).toISOString() },
      },
    });
    expect((await service.status('owner', 'space', 'design', 'Bearer token')).status).toBe(
      'FAILED',
    );
    expect((await service.generate('owner', 'space', 'design', 'Bearer token')).status).toBe(
      'READY',
    );
  });
});
