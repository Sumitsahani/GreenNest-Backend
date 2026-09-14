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
      where: { userId },
      orderBy: { nextWateringAt: 'asc' },
      take: 12,
    });
    const now = new Date();
    const due = plants.filter((plant) => plant.nextWateringAt <= now);
    const hottest = (weather?.temperature ?? 0) >= 32;
    const message = !plants.length
      ? 'Add your first plant to receive a personalized daily care briefing.'
      : due.length
        ? `${due.map((plant) => plant.name.trim()).join(', ')} ${due.length === 1 ? 'is' : 'are'} due for a soil check today.${hottest ? ' Hot weather may dry pots faster, but check soil before watering.' : ''}`
        : `All ${plants.length} plants are on schedule. Next check: ${plants[0]?.name.trim()} on ${plants[0]?.nextWateringAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.${weather?.humidity !== undefined && weather.humidity > 75 ? ' High humidity can slow soil drying.' : ''}`;
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
    const initialContext = await this.context.build(userId, content, dto.plantId);
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
          users[0]?.plantId !== (dto.plantId ?? null))
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
                plantId: dto.plantId,
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
        : await this.careActions.apply(userId, dto.plantId, content);
      const extracted = persisted.replay ? [] : this.extractor.extract(content, dto.plantId);
      if (extracted.length) await this.memories.apply(userId, extracted);
      if (!persisted.replay)
        await this.intelligence.learnFromConversation(userId, dto.plantId, content);
      const context = await this.context.build(userId, content, dto.plantId);
      const response =
        careAction?.reply ??
        (await this.responses.generate(
          content,
          context,
          dto.imageUrl,
          recentHistory.reverse().map((turn) => ({
            role: turn.role as 'USER' | 'ASSISTANT',
            content: turn.content,
          })),
          dto.language ?? 'AUTO',
        ));
      const assistantMessage = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.aiConversation.updateMany({
          where: { id: conversationId, userId, activeRequestId: requestId },
          data: { activeRequestId: null, updatedAt: new Date() },
        });
        if (!claimed.count) return null;
        return tx.aiMessage.create({
          data: {
            conversationId,
            requestId,
            role: AiMessageRole.ASSISTANT,
            content: response,
            plantId: dto.plantId,
            intent: context.intent,
            sourcesUsed: [
              ...context.sourcesUsed,
              ...(careAction?.update ? ['chat_care_update'] : []),
            ],
          },
        });
      });
      return {
        userMessage,
        userMessages: persisted.users,
        assistantMessage,
        superseded: assistantMessage === null,
        memoriesUpdated: extracted.length,
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
