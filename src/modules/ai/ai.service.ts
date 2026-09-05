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

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly extractor: MemoryExtractorService,
    private readonly memories: AiMemoryService,
    private readonly context: AiContextService,
    private readonly responses: AiResponseService,
    private readonly intelligence: PlantIntelligenceService,
  ) {}

  createConversation(userId: string, dto: CreateConversationDto): Promise<AiConversation> {
    return this.prisma.aiConversation.create({ data: { userId, title: dto.title?.trim() } });
  }

  listConversations(userId: string): Promise<AiConversation[]> {
    return this.prisma.aiConversation.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
  }

  identifyPlant(imageUrl: string): ReturnType<AiResponseService['identifyPlant']> {
    return this.responses.identifyPlant(imageUrl);
  }

  async briefing(userId: string, weather?: { temperature?: number; humidity?: number; weather?: string }): Promise<{ title: string; message: string; urgentCount: number }> {
    const plants = await this.prisma.gardenPlant.findMany({ where: { userId }, orderBy: { nextWateringAt: 'asc' }, take: 12 });
    const now = new Date();
    const due = plants.filter((plant) => plant.nextWateringAt <= now);
    const hottest = (weather?.temperature ?? 0) >= 32;
    const message = !plants.length
      ? 'Add your first plant to receive a personalized daily care briefing.'
      : due.length
        ? `${due.map((plant) => plant.name.trim()).join(', ')} ${due.length === 1 ? 'is' : 'are'} due for a soil check today.${hottest ? ' Hot weather may dry pots faster, but check soil before watering.' : ''}`
        : `All ${plants.length} plants are on schedule. Next check: ${plants[0]?.name.trim()} on ${plants[0]?.nextWateringAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.${weather?.humidity !== undefined && weather.humidity > 75 ? ' High humidity can slow soil drying.' : ''}`;
    return { title: due.length ? 'Care needed today' : 'Your garden is on track', message, urgentCount: due.length };
  }

  async messages(userId: string, conversationId: string): Promise<AiMessage[]> {
    await this.assertConversation(userId, conversationId);
    return this.prisma.aiMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
  }

  async send(userId: string, conversationId: string, dto: SendAiMessageDto): Promise<{ userMessage: AiMessage; assistantMessage: AiMessage; memoriesUpdated: number }> {
    await this.assertConversation(userId, conversationId);
    const content = dto.message.trim();
    // The first build validates optional plant ownership before any message is
    // persisted. Rebuild after extraction so an explicit correction in this
    // message can immediately influence the answer.
    const initialContext = await this.context.build(userId, content, dto.plantId);
    const recentHistory = await this.prisma.aiMessage.findMany({
      where: { conversationId, role: { in: [AiMessageRole.USER, AiMessageRole.ASSISTANT] } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { role: true, content: true },
    });
    const userMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: AiMessageRole.USER,
        content,
        plantId: dto.plantId,
        intent: initialContext.intent,
      },
    });
    if (recentHistory.length === 0) {
      await this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: { title: content.length > 52 ? `${content.slice(0, 49)}...` : content },
      });
    }
    const extracted = this.extractor.extract(content, dto.plantId);
    if (extracted.length) await this.memories.apply(userId, extracted);
    await this.intelligence.learnFromConversation(userId, dto.plantId, content);
    const context = await this.context.build(userId, content, dto.plantId);
    const response = await this.responses.generate(
      content,
      context,
      dto.imageUrl,
      recentHistory.reverse().map((turn) => ({
        role: turn.role as 'USER' | 'ASSISTANT',
        content: turn.content,
      })),
    );
    const assistantMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: AiMessageRole.ASSISTANT,
        content: response,
        plantId: dto.plantId,
        intent: context.intent,
        sourcesUsed: context.sourcesUsed,
      },
    });
    await this.prisma.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return { userMessage, assistantMessage, memoriesUpdated: extracted.length };
  }

  private async assertConversation(userId: string, id: string): Promise<void> {
    const conversation = await this.prisma.aiConversation.findFirst({ where: { id, userId }, select: { id: true } });
    if (!conversation) throw new BusinessException(ErrorCode.NOT_FOUND, 'AI conversation not found', HttpStatus.NOT_FOUND);
  }
}
