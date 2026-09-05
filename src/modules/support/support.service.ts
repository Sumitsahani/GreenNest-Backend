import { HttpStatus, Injectable } from '@nestjs/common';
import {
  SupportConversationStatus,
  SupportMessageSender,
  type SupportConversation,
  type SupportMessage,
} from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type {
  CloseSupportConversationDto,
  CreateSupportConversationDto,
  SendSupportMessageDto,
} from './dto/support.dto';

export type SupportConversationResponse = SupportConversation & {
  messages?: SupportMessage[];
};

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<SupportConversation[]> {
    return this.prisma.supportConversation.findMany({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
      take: 30,
    });
  }

  adminList(status?: SupportConversationStatus): Promise<SupportConversationResponse[]> {
    return this.prisma.supportConversation.findMany({
      where: status ? { status } : undefined,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
  }

  async create(
    userId: string,
    dto: CreateSupportConversationDto,
  ): Promise<SupportConversationResponse> {
    const message = dto.message.trim();
    const subject = dto.subject?.trim() || this.subjectFrom(message);
    return this.prisma.supportConversation.create({
      data: {
        userId,
        subject,
        messages: {
          create: [
            { sender: SupportMessageSender.USER, message },
            {
              sender: SupportMessageSender.SYSTEM,
              message:
                'Your message is saved. The GreenNest support team can reply in this conversation.',
            },
          ],
        },
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async messages(userId: string, id: string): Promise<SupportMessage[]> {
    await this.ownedConversation(userId, id);
    await this.prisma.supportMessage.updateMany({
      where: {
        conversationId: id,
        sender: { in: [SupportMessageSender.SUPPORT, SupportMessageSender.SYSTEM] },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return this.prisma.supportMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async send(
    userId: string,
    id: string,
    dto: SendSupportMessageDto,
  ): Promise<SupportMessage> {
    const conversation = await this.ownedConversation(userId, id);
    if (conversation.status === SupportConversationStatus.CLOSED) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Reopen this conversation before sending another message',
        HttpStatus.CONFLICT,
      );
    }
    const now = new Date();
    const [, message] = await this.prisma.$transaction([
      this.prisma.supportConversation.update({
        where: { id },
        data: { lastMessageAt: now },
      }),
      this.prisma.supportMessage.create({
        data: {
          conversationId: id,
          sender: SupportMessageSender.USER,
          message: dto.message.trim(),
        },
      }),
    ]);
    return message;
  }

  async close(
    userId: string,
    id: string,
    dto: CloseSupportConversationDto,
  ): Promise<SupportConversation> {
    await this.ownedConversation(userId, id);
    const now = new Date();
    const conversation = await this.prisma.supportConversation.update({
      where: { id },
      data: { status: SupportConversationStatus.CLOSED, lastMessageAt: now },
    });
    if (dto.reason?.trim()) {
      await this.prisma.supportMessage.create({
        data: {
          conversationId: id,
          sender: SupportMessageSender.SYSTEM,
          message: `Conversation closed: ${dto.reason.trim()}`,
        },
      });
    }
    return conversation;
  }

  async reopen(userId: string, id: string): Promise<SupportConversation> {
    await this.ownedConversation(userId, id);
    return this.prisma.supportConversation.update({
      where: { id },
      data: { status: SupportConversationStatus.OPEN, lastMessageAt: new Date() },
    });
  }

  async reply(id: string, dto: SendSupportMessageDto): Promise<SupportMessage> {
    const conversation = await this.prisma.supportConversation.findUnique({ where: { id } });
    if (!conversation) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Support conversation not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.supportMessage.create({
        data: {
          conversationId: id,
          sender: SupportMessageSender.SUPPORT,
          message: dto.message.trim(),
        },
      });
      await tx.supportConversation.update({
        where: { id },
        data: { status: SupportConversationStatus.OPEN, lastMessageAt: now },
      });
      await tx.notification.create({
        data: {
          userId: conversation.userId,
          title: 'GreenNest Support replied',
          message: dto.message.trim().slice(0, 240),
          type: 'SUPPORT_REPLY',
        },
      });
      return message;
    });
  }

  private async ownedConversation(userId: string, id: string): Promise<SupportConversation> {
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { id, userId },
    });
    if (!conversation) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Support conversation not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return conversation;
  }

  private subjectFrom(message: string): string {
    const normalized = message.replace(/\s+/g, ' ').trim();
    return normalized.length <= 70 ? normalized : `${normalized.slice(0, 67)}...`;
  }
}
