import 'reflect-metadata';
import { PrismaClient, type Prisma } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/database/prisma.service';
import { SpaceDesignsService } from '../src/modules/spaces/space-designs.service';

/** Real database smoke test. All temporary rows are rolled back, including on failure. */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const rollback = new Error('intentional-smoke-test-rollback');
  try {
    await prisma.$transaction(
      async (tx) => {
        const product = await tx.product.findFirst({ where: { active: true } });
        assert(product, 'Seed at least one active catalog plant first');
        const userId = randomUUID();
        const space = await tx.space.create({
          data: {
            userId,
            photoPath: `${userId}/spaces/test-only.jpg`,
            analysisStatus: 'COMPLETED',
            scene: {
              create: {
                proportions: {},
                objects: [],
                surfaces: [],
                environment: {},
                confidence: 0.8,
                analysisModel: 'smoke-fixture',
                placementZones: [
                  {
                    zoneId: 'floor',
                    type: 'FLOOR',
                    location: 'LEFT',
                    available: true,
                    boundingBox: [0.1, 0.2, 0.3, 0.4],
                  },
                ],
              },
            },
          },
        });
        const match = await tx.spacePlantRecommendation.create({
          data: {
            spaceId: space.id,
            productId: product.id,
            zoneId: 'floor',
            style: 'MINIMAL',
            carePreference: 'EASY',
            rank: 1,
            designScore: 90,
            environmentScore: 90,
            lightScore: 90,
            spaceScore: 90,
            careScore: 90,
            preferenceScore: 90,
            overallScore: 90,
            confidence: 'HIGH',
            reasonEnglish: 'Test placement',
            reasonHindi: 'जाँच के लिए जगह',
          },
        });
        const service = new SpaceDesignsService({
          space: tx.space,
          spaceDesign: tx.spaceDesign,
          spacePlantRecommendation: tx.spacePlantRecommendation,
          $transaction: (callback: (client: Prisma.TransactionClient) => Promise<unknown>) =>
            callback(tx),
        } as unknown as PrismaService);
        const input = {
          requestId: randomUUID(),
          title: 'Smoke design',
          style: 'MINIMAL' as const,
          carePreference: 'EASY' as const,
          recommendationIds: [match.id],
        };
        const saved = await service.create(userId, space.id, input);
        const retry = await service.create(userId, space.id, input);
        assert.equal(retry.id, saved.id);
        assert.equal(await tx.spaceDesign.count({ where: { spaceId: space.id } }), 1);
        assert.equal(
          await tx.engagementEvent.count({ where: { userId, name: 'space_design_saved' } }),
          1,
        );
        assert.equal((await service.list(userId, space.id))[0]?.id, saved.id);
        await assert.rejects(service.detail(randomUUID(), space.id, saved.id));
        await assert.rejects(service.list(randomUUID(), space.id));
        await assert.rejects(
          service.create(userId, space.id, { ...input, title: 'Different payload' }),
        );
        await tx.spacePlantRecommendation.deleteMany({ where: { spaceId: space.id } });
        assert.deepEqual((await service.detail(userId, space.id, saved.id)).scene, saved.scene);
        assert.equal((await service.create(userId, space.id, input)).id, saved.id);
        const claimedScene = {
          ...(saved.scene as Prisma.InputJsonObject),
          render: {
            status: 'GENERATING',
            attempt: 'test-claim',
            startedAt: new Date().toISOString(),
          },
        };
        const claim = await tx.spaceDesign.updateMany({
          where: { id: saved.id, scene: { equals: saved.scene as Prisma.InputJsonValue } },
          data: { scene: claimedScene },
        });
        assert.equal(claim.count, 1);
        const competingClaim = await tx.spaceDesign.updateMany({
          where: { id: saved.id, scene: { equals: saved.scene as Prisma.InputJsonValue } },
          data: { scene: claimedScene },
        });
        assert.equal(competingClaim.count, 0);
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
    console.log(
      'PASS: save, reload, retry deduplication, ownership, events, snapshot persistence and atomic image claims. Temporary rows rolled back.',
    );
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : 'Unknown failure';
  for (const value of Object.values(process.env)) {
    if (value && value.length > 7) message = message.split(value).join('[redacted]');
  }
  console.error('Space design database smoke test failed:', message);
  process.exitCode = 1;
});
