import { mentionsPlantProblem } from './consultation';
import {
  consultationKey,
  consultationScope,
  storedConsultation,
  consultationMemoryData,
} from './consultation-memory';
import { paginate, dateRange, listDirection, type PageResult } from '../../common/pagination';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import type { Prisma } from '@prisma/client';
import { calculateWatering, wateringEvidence } from '../garden/watering-engine';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AiMessageRole, type AiConversation, type AiMessage } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { CreateConversationDto, SendAiMessageDto } from './dto/ai.dto';
import { AiContextService } from './ai-context.service';
import { AiMemoryService } from './ai-memory.service';
import { AiResponseService } from './ai-response.service';
import { MemoryExtractorService } from './memory-extractor.service';
import { PlantIntelligenceService } from '../intelligence/plant-intelligence.service';
import { AiCareActionService, type AiCareUpdate } from './ai-care-action.service';

@Injectable()
export class AiService {
  conversationsPage(userId: string, query: ListQueryDto): Promise<PageResult<AiConversation>> {
    const where: Prisma.AiConversationWhereInput = {
      userId,
      createdAt: dateRange(query),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    return paginate(
      query,
      (skip, take) =>
        this.prisma.aiConversation.findMany({
          where,
          skip,
          take,
          orderBy: [{ updatedAt: listDirection(query) }, { id: 'asc' }],
        }),
      () => this.prisma.aiConversation.count({ where }),
    );
  }
  async messagesPage(
    userId: string,
    conversationId: string,
    query: ListQueryDto,
  ): Promise<PageResult<AiMessage>> {
    await this.assertConversation(userId, conversationId);
    const where: Prisma.AiMessageWhereInput = {
      conversationId,
      createdAt: dateRange(query),
      ...(query.search ? { content: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    return paginate(
      query,
      (skip, take) =>
        this.prisma.aiMessage.findMany({
          where,
          skip,
          take,
          orderBy: [{ sequence: listDirection(query) }, { id: 'asc' }],
        }),
      () => this.prisma.aiMessage.count({ where }),
    );
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractor: MemoryExtractorService,
    private readonly memories: AiMemoryService,
    private readonly context: AiContextService,
    private readonly responses: AiResponseService,
    private readonly intelligence: PlantIntelligenceService,
    private readonly careActions: AiCareActionService,
  ) {}

  createConversation(userId: string, dto: CreateConversationDto): Promise<AiConversation> {
    return this.prisma.aiConversation.create({ data: { userId, title: dto.title?.trim() } });
  }

  listConversations(userId: string): Promise<AiConversation[]> {
    return this.prisma.aiConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  identifyPlant(imageUrl: string): ReturnType<AiResponseService['identifyPlant']> {
    return this.responses.identifyPlant(imageUrl);
  }

  async briefing(
    userId: string,
    weather?: { temperature?: number; humidity?: number; weather?: string },
  ): Promise<{ title: string; message: string; urgentCount: number }> {
    const plants = await this.prisma.gardenPlant.findMany({
      where: { userId, lifecycleStatus: { in: ['ACTIVE', 'MOVED'] } },
      include: wateringEvidence,
      orderBy: { nextWateringAt: 'asc' },
      take: 500,
    });
    const now = new Date();
    const due = plants.filter((plant) =>
      ['DUE', 'OVERDUE', 'INSPECT_FIRST', 'UNCERTAIN'].includes(
        calculateWatering(plant, now).wateringStatus,
      ),
    );
    const hottest = (weather?.temperature ?? 0) >= 32;
    const message = !plants.length
      ? 'Add your first plant to receive a personalized daily care briefing.'
      : due.length
        ? `${due.map((plant) => plant.name.trim()).join(', ')} ${due.length === 1 ? 'is' : 'are'} due for a soil check today.${hottest ? ' Hot weather may dry pots faster, but check soil before watering.' : ''}`
        : `No watering action is needed for your ${plants.length} plants right now. Check individual soil observations when conditions change.`;
    return {
      title: due.length ? 'Care needed today' : 'Your garden is on track',
      message,
      urgentCount: due.length,
    };
  }

  async messages(userId: string, conversationId: string): Promise<AiMessage[]> {
    await this.assertConversation(userId, conversationId);
    return this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { sequence: 'asc' },
    });
  }

  async send(
    userId: string,
    conversationId: string,
    dto: SendAiMessageDto,
  ): Promise<{
    userMessage: AiMessage;
    userMessages?: AiMessage[];
    assistantMessage: AiMessage | null;
    memoriesUpdated: number;
    careUpdate?: AiCareUpdate;
    superseded?: boolean;
  }> {
    await this.assertConversation(userId, conversationId);
    const lastPlant =
      dto.plantId === undefined
        ? await this.prisma.aiMessage.findFirst({
            where: { conversationId, role: AiMessageRole.USER },
            orderBy: { sequence: 'desc' },
            select: { plantId: true },
          })
        : null;
    const plantId = dto.plantId ?? lastPlant?.plantId ?? undefined;
    const consultationRecord = await this.prisma.aiUserMemory.findFirst({
      where: {
        userId,
        scopeKey: consultationScope(conversationId, plantId),
        memoryKey: consultationKey,
        status: 'ACTIVE',
      },
    });
    const priorConsultation = storedConsultation(consultationRecord?.evidence);
    const originals = (dto.messages ?? [dto.message]).map((message) => message.trim());
    const content = originals.join('\n');
    if (originals.some((message) => !message) || content.length > 4000)
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Send between 1 and 4000 characters per batch.',
        HttpStatus.BAD_REQUEST,
      );
    const requestId = dto.requestId ?? crypto.randomUUID();
    // The first build validates optional plant ownership before any message is
    // persisted. Rebuild after extraction so an explicit correction in this
    // message can immediately influence the answer.
    const initialContext = await this.context.build(userId, content, plantId);
    const persisted = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`chat:${conversationId}`}, 0))::text`;
      const old = await tx.aiMessage.findMany({
        where: { conversationId, requestId },
        orderBy: { sequence: 'asc' },
      });
      const users = old.filter((message) => message.role === AiMessageRole.USER);
      if (
        users.length &&
        (users.map((message) => message.content).join('\n') !== content ||
          users[0]?.plantId !== (plantId ?? null))
      )
        throw new BusinessException(
          ErrorCode.VALIDATION_ERROR,
          'This request ID belongs to different messages.',
          HttpStatus.CONFLICT,
        );
      const assistant = old.find((message) => message.role === AiMessageRole.ASSISTANT);
      if (assistant) return { users, assistant, replay: true };
      const current = await tx.aiConversation.findUniqueOrThrow({ where: { id: conversationId } });
      if (
        users.length &&
        current.activeRequestId === requestId &&
        Date.now() - current.updatedAt.getTime() < 120_000
      )
        throw new BusinessException(
          ErrorCode.RESOURCE_ALREADY_EXISTS,
          'This reply is still being prepared. Please wait before retrying.',
          HttpStatus.CONFLICT,
        );
      await tx.aiConversation.update({
        where: { id: conversationId },
        data: { activeRequestId: requestId },
      });
      if (!users.length) {
        for (const [batchIndex, message] of originals.entries())
          users.push(
            await tx.aiMessage.create({
              data: {
                conversationId,
                requestId,
                batchIndex,
                role: AiMessageRole.USER,
                content: message,
                plantId: plantId,
                intent: initialContext.intent,
              },
            }),
          );
      }
      return { users, assistant: null, replay: old.length > 0 };
    });
    const userMessage = persisted.users[0]!;
    if (persisted.assistant)
      return {
        userMessage,
        userMessages: persisted.users,
        assistantMessage: persisted.assistant,
        memoriesUpdated: 0,
      };
    try {
      const recentHistory = await this.prisma.aiMessage.findMany({
        where: {
          conversationId,
          sequence: { lt: userMessage.sequence },
          role: { in: [AiMessageRole.USER, AiMessageRole.ASSISTANT] },
        },
        orderBy: { sequence: 'desc' },
        take: 12,
        select: { role: true, content: true },
      });
      if (recentHistory.length === 0) {
        await this.prisma.aiConversation.update({
          where: { id: conversationId },
          data: { title: content.length > 52 ? `${content.slice(0, 49)}...` : content },
        });
      }
      const careAction = persisted.replay
        ? null
        : await this.careActions.apply(userId, plantId, content, userMessage.id);
      const extracted = persisted.replay ? [] : this.extractor.extract(content, plantId);
      if (extracted.length) await this.memories.apply(userId, extracted);
      if (!persisted.replay)
        await this.intelligence.learnFromConversation(userId, plantId, content);
      const context = await this.context.build(userId, content, plantId);
      const needsConsultation = !!priorConsultation || mentionsPlantProblem(content);
      if (careAction?.reply)
        context.promptContext += `\nCONFIRMED APPLICATION RESULT: ${careAction.reply}`;
      const generated =
        careAction?.reply && !needsConsultation
          ? { reply: careAction.reply, consultation: null }
          : await this.responses.consult(
              content,
              context,
              dto.imageUrl,
              recentHistory
                .reverse()
                .map((turn) => ({
                  role: turn.role as 'USER' | 'ASSISTANT',
                  content: turn.content,
                })),
              dto.language ?? 'AUTO',
              priorConsultation,
            );
      const assistantMessage = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.aiConversation.updateMany({
          where: { id: conversationId, userId, activeRequestId: requestId },
          data: { activeRequestId: null, updatedAt: new Date() },
        });
        if (!claimed.count) return null;
        const saved = await tx.aiMessage.create({
          data: {
            conversationId,
            requestId,
            role: AiMessageRole.ASSISTANT,
            content: generated.reply,
            plantId: plantId,
            intent: context.intent,
            sourcesUsed: [
              ...context.sourcesUsed,
              ...(careAction?.update ? ['chat_care_update'] : []),
            ],
          },
        });
        if (generated.consultation)
          await tx.aiUserMemory.upsert(
            consultationMemoryData({
              userId,
              conversationId,
              plantId,
              state: generated.consultation,
              userMessageId: userMessage.id,
              assistantMessageId: saved.id,
              imageUrl: dto.imageUrl,
              previousEvidence: consultationRecord?.evidence,
            }),
          );
        return saved;
      });
      return {
        userMessage,
        userMessages: persisted.users,
        assistantMessage,
        superseded: assistantMessage === null,
        memoriesUpdated: extracted.length + (assistantMessage && generated.consultation ? 1 : 0),
        careUpdate: careAction?.update,
      };
    } catch (error) {
      await this.prisma.aiConversation.updateMany({
        where: { id: conversationId, activeRequestId: requestId },
        data: { activeRequestId: null },
      });
      throw error;
    }
  }

  private async assertConversation(userId: string, id: string): Promise<void> {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!conversation)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'AI conversation not found',
        HttpStatus.NOT_FOUND,
      );
  }
}
