/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  AiMemoryType,
  EvidenceSource,
  MemoryStatus,
} from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { AiMemoryService } from './ai-memory.service';
import type { ExtractedMemory } from './memory-extractor.service';

describe('AiMemoryService', () => {
  const memory: ExtractedMemory = {
    key: 'soil_drying_days',
    value: '5 days',
    type: AiMemoryType.USER_CORRECTION,
    confidence: 0.98,
    operation: 'upsert',
    plantId: 'plant-a',
    source: EvidenceSource.USER_CORRECTION,
    evidence: { statement: 'My soil stays wet for 5 days.' },
  };

  const setup = (
    existing: Record<string, unknown>[] = [],
  ): {
    service: AiMemoryService;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
    transaction: jest.Mock;
  } => {
    const create = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findMany = jest.fn().mockResolvedValue(existing);
    const transaction = jest.fn().mockResolvedValue([]);
    const prisma = {
      aiUserMemory: { create, update, updateMany, findMany },
      $transaction: transaction,
    } as unknown as PrismaService;
    return {
      service: new AiMemoryService(prisma),
      create,
      update,
      updateMany,
      findMany,
      transaction,
    };
  };

  it('creates a plant-scoped memory with source, confidence and evidence', async () => {
    const mocks = setup();

    await mocks.service.apply('user-a', [memory]);

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-a',
        plantId: 'plant-a',
        scopeKey: 'PLANT:plant-a',
        confidence: 0.98,
        source: EvidenceSource.USER_CORRECTION,
      }),
    });
  });

  it('reinforces an identical memory instead of duplicating it', async () => {
    const mocks = setup([
      {
        id: 'memory-a',
        scopeKey: 'PLANT:plant-a',
        memoryKey: memory.key,
        memoryValue: memory.value,
        status: MemoryStatus.ACTIVE,
      },
    ]);

    await mocks.service.apply('user-a', [memory]);

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'memory-a' },
        data: expect.objectContaining({ reinforcementCount: { increment: 1 } }),
      }),
    );
  });

  it('preserves changed evidence as superseded before creating the current value', async () => {
    const mocks = setup([
      {
        id: 'memory-old',
        scopeKey: 'PLANT:plant-a',
        memoryKey: memory.key,
        memoryValue: '3 days',
        status: MemoryStatus.ACTIVE,
      },
    ]);

    await mocks.service.apply('user-a', [memory]);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'memory-old' },
        data: expect.objectContaining({ status: MemoryStatus.SUPERSEDED }),
      }),
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memoryKey: memory.key,
          memoryValue: '5 days',
        }),
      }),
    );
  });

  it('scopes relevant memory retrieval to the authenticated user and current plant', async () => {
    const mocks = setup();

    await mocks.service.relevant('user-a', 'Should I water?', 6, 'plant-a');

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-a',
          OR: [{ plantId: 'plant-a' }, { plantId: null }],
        }),
      }),
    );
  });
});
