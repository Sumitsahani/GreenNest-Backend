import { AiService } from './ai.service';
import { AiMessageRole } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import type { MemoryExtractorService } from './memory-extractor.service';
import type { AiMemoryService } from './ai-memory.service';
import type { AiContextService } from './ai-context.service';
import type { AiResponseService } from './ai-response.service';
import type { PlantIntelligenceService } from '../intelligence/plant-intelligence.service';
import type { AiCareActionService } from './ai-care-action.service';
import type { Consultation } from './consultation';
import { consultationMemoryData } from './consultation-memory';
const state: Consultation = {
  stage: 'INVESTIGATING',
  focus: 'WATERING_DRAINAGE',
  confidence: 'LOW',
  opening: 'Let us investigate.',
  questions: ['Does water drain out?', 'How long has yellowing continued?'],
  photoRequests: [],
  knownFacts: [],
  symptoms: ['Yellow leaves'],
  suspectedCause: '',
  evidence: [],
  alternatives: [],
  missingEvidence: ['Drainage'],
  confirmation: [],
  treatment: [],
  avoid: [],
  monitoring: [],
  followUp: '',
  userActions: [],
  expectedResponse: '',
  outcome: '',
  homeRemedy: '',
};
// Test harness intentionally infers its mock return types.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(claimed = true) {
  const consultation = {
    evidence: consultationMemoryData({
      userId: 'u',
      conversationId: 'c',
      plantId: 'p',
      state,
      userMessageId: 'old-u',
      assistantMessageId: 'old-a',
    }).create.evidence,
  };
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    aiConversation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'c' }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'c', activeRequestId: null, updatedAt: new Date(0) }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: claimed ? 1 : 0 }),
    },
    aiMessage: {
      findFirst: jest.fn().mockResolvedValue({ plantId: 'p' }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...data,
          id: data.role === 'USER' ? 'user-1' : 'assistant-1',
          sequence: 1,
        }),
      ),
    },
    aiUserMemory: {
      findFirst: jest.fn().mockResolvedValue(consultation),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    ...db,
    $transaction: jest.fn((fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  };
  const context = {
    build: jest.fn().mockResolvedValue({
      intent: 'PLANT_HEALTH',
      sourcesUsed: [],
      promptContext: 'Pothos',
      plantId: 'p',
    }),
  };
  const responses = {
    consult: jest.fn().mockResolvedValue({ reply: 'Does water drain out?', consultation: state }),
  };
  const care = { apply: jest.fn().mockResolvedValue(null) };
  const service = new AiService(
    prisma as unknown as PrismaService,
    { extract: jest.fn().mockReturnValue([]) } as unknown as MemoryExtractorService,
    { apply: jest.fn() } as unknown as AiMemoryService,
    context as unknown as AiContextService,
    responses as unknown as AiResponseService,
    {
      learnFromConversation: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlantIntelligenceService,
    care as unknown as AiCareActionService,
  );
  return { service, db, prisma, context, responses, care };
}
describe('Durable doctor consultations', () => {
  it('restores the conversation plant and writes the accepted reply and snapshot in one transaction', async () => {
    const { service, db, prisma, context, responses } = setup();
    const result = await service.send('u', 'c', {
      message: 'Soil stays wet four days',
      requestId: '00000000-0000-4000-8000-000000000001',
    });
    expect(context.build).toHaveBeenCalledWith('u', 'Soil stays wet four days', 'p');
    expect(responses.consult).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      undefined,
      expect.any(Array),
      'AUTO',
      state,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(db.aiUserMemory.upsert).toHaveBeenCalledTimes(1);
    expect(db.aiUserMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'u',
          plantId: 'p',
          source: 'AI_INFERENCE',
          evidence: expect.objectContaining({ assistantMessageId: 'assistant-1' }) as unknown,
        }) as unknown,
      }),
    );
    expect(result.assistantMessage?.role).toBe(AiMessageRole.ASSISTANT);
  });
  it('does not persist a stale consultation when a newer request won the claim', async () => {
    const { service, db } = setup(false);
    const result = await service.send('u', 'c', { message: 'Leaves are yellow', plantId: 'p' });
    expect(result.superseded).toBe(true);
    expect(db.aiUserMemory.upsert).not.toHaveBeenCalled();
  });
  it('continues the consultation after a reported watering action', async () => {
    const { service, responses, care } = setup();
    care.apply.mockResolvedValue({ reply: 'Watering saved.' });
    await service.send('u', 'c', { message: 'I watered yesterday', plantId: 'p' });
    expect(responses.consult).toHaveBeenCalled();
  });
  it('does not read or write another users conversation', async () => {
    const { service, db, responses } = setup();
    db.aiConversation.findFirst.mockResolvedValue(null);
    await expect(service.send('other', 'c', { message: 'Yellow leaves' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(db.aiUserMemory.findFirst).not.toHaveBeenCalled();
    expect(responses.consult).not.toHaveBeenCalled();
  });
});
