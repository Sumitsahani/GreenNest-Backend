/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { SupportConversationStatus, SupportMessageSender } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { SupportService } from './support.service';

describe('SupportService', () => {
  it('creates a persisted conversation with user and system messages', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'conversation-1' });
    const prisma = {
      supportConversation: { create },
    } as unknown as PrismaService;
    const service = new SupportService(prisma);

    await service.create('user-1', { message: 'My order needs help' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          messages: {
            create: expect.arrayContaining([
              expect.objectContaining({ sender: SupportMessageSender.USER }),
              expect.objectContaining({ sender: SupportMessageSender.SYSTEM }),
            ]),
          },
        }),
      }),
    );
  });

  it('lets a support agent reply and notifies the owning user', async () => {
    const reply = {
      id: 'message-1',
      conversationId: 'conversation-1',
      sender: SupportMessageSender.SUPPORT,
      message: 'We are checking this for you.',
      readAt: null,
      createdAt: new Date(),
    };
    const tx = {
      supportMessage: { create: jest.fn().mockResolvedValue(reply) },
      supportConversation: { update: jest.fn().mockResolvedValue({}) },
      notification: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      supportConversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conversation-1',
          userId: 'user-1',
          status: SupportConversationStatus.OPEN,
        }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new SupportService(prisma);

    await expect(
      service.reply('conversation-1', { message: reply.message }),
    ).resolves.toEqual(reply);
    expect(tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', type: 'SUPPORT_REPLY' }),
      }),
    );
  });
});
