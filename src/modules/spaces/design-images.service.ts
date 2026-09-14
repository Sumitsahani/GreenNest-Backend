import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { readBox, type DesignScene } from './design-scene';
import { DesignImageProvider, imageFailure } from './design-image-provider';
import { DesignImageStorage } from './design-image-storage';

type Render = {
  status: 'GENERATING' | 'READY' | 'FAILED';
  attempt: string;
  startedAt: string;
  path?: string;
  model?: string;
  error?: string;
};
type RenderScene = DesignScene & { render?: Render };
export type DesignImageResult = {
  status: 'NOT_STARTED' | Render['status'];
  imageUrl: string | null;
  error: string | null;
};

@Injectable()
export class DesignImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: DesignImageProvider,
    private readonly storage: DesignImageStorage,
  ) {}

  private async owned(
    userId: string,
    spaceId: string,
    id: string,
  ): Promise<Prisma.SpaceDesignGetPayload<{ include: { space: true } }>> {
    const design = await this.prisma.spaceDesign.findFirst({
      where: { id, spaceId, space: { userId } },
      include: { space: true },
    });
    if (!design)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Saved design not found',
        HttpStatus.NOT_FOUND,
      );
    return design;
  }
  private async result(scene: RenderScene, authorization: string): Promise<DesignImageResult> {
    const render = scene.render;
    if (render?.status === 'READY' && render.path)
      return {
        status: 'READY',
        imageUrl: await this.storage.sign(render.path, authorization),
        error: null,
      };
    if (render?.status === 'GENERATING' && Date.now() - Date.parse(render.startedAt) > 300000)
      return {
        status: 'FAILED',
        imageUrl: null,
        error: 'Image generation was interrupted. Please try again.',
      };
    return {
      status: render?.status ?? 'NOT_STARTED',
      imageUrl: null,
      error: render?.error ?? null,
    };
  }
  async status(
    userId: string,
    spaceId: string,
    id: string,
    authorization: string,
  ): Promise<DesignImageResult> {
    const design = await this.owned(userId, spaceId, id);
    return this.result(design.scene as RenderScene, authorization);
  }
  async generate(
    userId: string,
    spaceId: string,
    id: string,
    authorization: string,
  ): Promise<DesignImageResult> {
    const design = await this.owned(userId, spaceId, id);
    const source = design.scene as RenderScene;
    const current = await this.result(source, authorization);
    if (current.status === 'READY' || current.status === 'GENERATING') return current;
    if (
      source.schemaVersion !== 1 ||
      !source.plants?.length ||
      source.plants.some((p) => !readBox(p.boundingBox))
    )
      throw imageFailure(
        'Plant positions are unclear. Use a clearer room photo before generating an image.',
      );
    if (
      !design.space.photoPath.startsWith(`${userId}/spaces/`) ||
      design.space.photoPath.includes('..')
    )
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        'This space photo does not belong to your account',
        HttpStatus.FORBIDDEN,
      );
    const render: Render = {
      status: 'GENERATING',
      attempt: randomUUID(),
      startedAt: new Date().toISOString(),
    };
    const claimed = { ...source, render };
    // Atomic JSON comparison prevents concurrent renders, across API processes too.
    const claim = await this.prisma.spaceDesign.updateMany({
      where: { id, scene: { equals: design.scene as Prisma.InputJsonValue } },
      data: { scene: claimed },
    });
    if (!claim.count) return this.status(userId, spaceId, id, authorization);
    try {
      const room = await this.storage.load(design.space.photoPath, authorization);
      const image = await this.provider.generate(room, source);
      const extension =
        image.mime_type === 'image/png' ? 'png' : image.mime_type === 'image/jpeg' ? 'jpg' : 'webp';
      const path = `${userId}/spaces/designs/${id}/${render.attempt}.${extension}`;
      await this.storage.save(path, image, authorization);
      const completed: RenderScene = {
        ...source,
        render: { ...render, status: 'READY', path, model: image.model },
      };
      await this.prisma.spaceDesign.updateMany({
        where: { id, scene: { equals: claimed } },
        data: { scene: completed },
      });
      return this.result(completed, authorization);
    } catch (error) {
      const message =
        error instanceof BusinessException
          ? error.message
          : 'The image could not be created. Please try again.';
      await this.prisma.spaceDesign.updateMany({
        where: { id, scene: { equals: claimed } },
        data: { scene: { ...source, render: { ...render, status: 'FAILED', error: message } } },
      });
      throw imageFailure(message);
    }
  }
}
