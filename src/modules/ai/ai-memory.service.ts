import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AiMemoryType,
  EvidenceSource,
  MemoryStatus,
  Prisma,
  type AiUserMemory,
} from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { UpdateMemoryDto } from './dto/ai.dto';
import type { ExtractedMemory } from './memory-extractor.service';

@Injectable()
export class AiMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<AiUserMemory[]> {
    return this.prisma.aiUserMemory.findMany({
      where: { userId, status: MemoryStatus.ACTIVE },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async apply(userId: string, memories: ExtractedMemory[]): Promise<void> {
    if (!memories.length) return;
    const scopeFor = (memory: ExtractedMemory): string =>
      memory.plantId ? `PLANT:${memory.plantId}` : 'USER';
    const existing = await this.prisma.aiUserMemory.findMany({
      where: {
        userId,
        OR: memories.map((memory) => ({
          scopeKey: scopeFor(memory),
          memoryKey: memory.key,
        })),
      },
    });
    const existingByKey = new Map(
      existing.map((memory) => [
        `${memory.scopeKey}:${memory.memoryKey}`,
        memory,
      ]),
    );
    const operations: Prisma.PrismaPromise<unknown>[] = [];

    for (const memory of memories) {
      const scopeKey = scopeFor(memory);
      const previous = existingByKey.get(`${scopeKey}:${memory.key}`);
      if (memory.operation === 'delete') {
        operations.push(
          this.prisma.aiUserMemory.updateMany({
            where: {
              userId,
              scopeKey,
              memoryKey: memory.key,
              status: MemoryStatus.ACTIVE,
            },
            data: { status: MemoryStatus.ARCHIVED },
          }),
        );
        continue;
      }

      const data = {
        memoryValue: memory.value,
        memoryType: memory.type,
        confidence: memory.confidence,
        source: memory.source ?? EvidenceSource.USER_STATEMENT,
        evidence: memory.evidence,
        status: MemoryStatus.ACTIVE,
        supersededAt: null,
      } as const;
      if (previous?.status === MemoryStatus.ACTIVE && previous.memoryValue !== memory.value) {
        operations.push(
          this.prisma.aiUserMemory.update({
            where: { id: previous.id },
            data: {
              memoryKey: `${memory.key}:superseded:${previous.id}`,
              status: MemoryStatus.SUPERSEDED,
              supersededAt: new Date(),
            },
          }),
        );
        operations.push(
          this.prisma.aiUserMemory.create({
            data: {
              userId,
              plantId: memory.plantId,
              scopeKey,
              memoryKey: memory.key,
              ...data,
            },
          }),
        );
      } else if (previous) {
        operations.push(
          this.prisma.aiUserMemory.update({
            where: { id: previous.id },
            data: { ...data, reinforcementCount: { increment: 1 } },
          }),
        );
      } else {
        operations.push(
          this.prisma.aiUserMemory.create({
            data: {
              userId,
              plantId: memory.plantId,
              scopeKey,
              memoryKey: memory.key,
              ...data,
            },
          }),
        );
      }
    }
    await this.prisma.$transaction(operations);
  }

  async relevant(userId: string, query: string, limit = 6, plantId?: string): Promise<AiUserMemory[]> {
    const types = this.relevantTypes(query);
    const memories = await this.prisma.aiUserMemory.findMany({
      where: {
        userId,
        status: MemoryStatus.ACTIVE,
        confidence: { gte: 0.75 },
        ...(plantId ? { OR: [{ plantId }, { plantId: null }] } : { plantId: null }),
        ...(types.length ? { memoryType: { in: types } } : {}),
      },
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });
    if (memories.length) {
      await this.prisma.aiUserMemory.updateMany({
        where: { id: { in: memories.map(({ id }) => id) }, userId },
        data: { lastUsedAt: new Date() },
      });
    }
    return memories;
  }

  async update(userId: string, id: string, dto: UpdateMemoryDto): Promise<AiUserMemory> {
    await this.assertOwned(userId, id);
    try {
      return await this.prisma.aiUserMemory.update({
        where: { id },
        data: {
          ...(dto.memoryKey !== undefined ? { memoryKey: dto.memoryKey.trim() } : {}),
          ...(dto.memoryValue !== undefined ? { memoryValue: dto.memoryValue.trim() } : {}),
          ...(dto.memoryType !== undefined ? { memoryType: dto.memoryType } : {}),
          ...(dto.confidence !== undefined ? { confidence: dto.confidence } : {}),
          source: EvidenceSource.USER_CORRECTION,
          status: MemoryStatus.ACTIVE,
          supersededAt: null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BusinessException(ErrorCode.RESOURCE_ALREADY_EXISTS, 'Memory key already exists', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    await this.assertOwned(userId, id);
    await this.prisma.aiUserMemory.update({
      where: { id },
      data: { status: MemoryStatus.ARCHIVED },
    });
    return { deleted: true };
  }

  async supersedeMemory(userId: string, id: string): Promise<AiUserMemory> {
    await this.assertOwned(userId, id);
    return this.prisma.aiUserMemory.update({
      where: { id },
      data: { status: MemoryStatus.SUPERSEDED, supersededAt: new Date() },
    });
  }

  recordCorrection(
    userId: string,
    plantId: string | undefined,
    key: string,
    value: string,
    evidence?: Prisma.InputJsonValue,
  ): Promise<void> {
    return this.apply(userId, [
      {
        key,
        value,
        type: AiMemoryType.USER_CORRECTION,
        confidence: 0.98,
        operation: 'upsert',
        plantId,
        source: EvidenceSource.USER_CORRECTION,
        evidence,
      },
    ]);
  }

  private async assertOwned(userId: string, id: string): Promise<void> {
    const memory = await this.prisma.aiUserMemory.findFirst({ where: { id, userId }, select: { id: true } });
    if (!memory) throw new BusinessException(ErrorCode.NOT_FOUND, 'AI memory not found', HttpStatus.NOT_FOUND);
  }

  private relevantTypes(query: string): AiMemoryType[] {
    const q = query.toLowerCase();
    const types = new Set<AiMemoryType>();
    if (/buy|shop|price|budget|recommend/.test(q)) types.add(AiMemoryType.SHOPPING_PREFERENCE);
    if (/water|fertili|prun|repot|care|maintenance/.test(q)) types.add(AiMemoryType.CARE_PREFERENCE);
    if (/soil|wet|dry|symptom|yellow|root|rot|health/.test(q)) types.add(AiMemoryType.PLANT_OBSERVATION);
    if (/mistake|usually|often|always|pattern|previous/.test(q)) types.add(AiMemoryType.USER_PATTERN);
    if (/plant|flower|herb|vegetable|seed/.test(q)) types.add(AiMemoryType.PLANT_PREFERENCE);
    if (/sun|light|balcony|indoor|outdoor|space|weather/.test(q)) types.add(AiMemoryType.ENVIRONMENT);
    if (/beginner|easy|difficult|experience|learn/.test(q)) types.add(AiMemoryType.EXPERIENCE);
    if (/goal|plan|start|grow/.test(q)) types.add(AiMemoryType.GOAL);
    return [...types];
  }
}
