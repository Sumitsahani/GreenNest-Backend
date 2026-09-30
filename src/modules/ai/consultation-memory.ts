import { AiMemoryType, EvidenceSource, MemoryStatus, type Prisma } from '@prisma/client';
import { parseConsultation, type Consultation } from './consultation';
export const consultationKey = 'plant_doctor_consultation';
export const consultationScope = (conversationId: string, plantId?: string): string =>
  `CONSULTATION:${conversationId}:${plantId ?? 'UNASSIGNED'}`;
export function storedConsultation(evidence: unknown): Consultation | null {
  if (!evidence || typeof evidence !== 'object' || !('state' in evidence)) return null;
  try {
    const state = (evidence).state;
    return parseConsultation(JSON.stringify(state), {
      previous: state as Consultation,
      hasImage: true,
    });
  } catch {
    return null;
  }
}
export function consultationMemoryData(input: {
  userId: string;
  conversationId: string;
  plantId?: string;
  state: Consultation;
  userMessageId: string;
  assistantMessageId: string;
  imageUrl?: string;
  previousEvidence?: unknown;
}): Prisma.AiUserMemoryUpsertArgs {
  const { userId, conversationId, plantId, state, userMessageId, assistantMessageId } = input;
  const scopeKey = consultationScope(conversationId, plantId);
  const previous =
    input.previousEvidence && typeof input.previousEvidence === 'object'
      ? (input.previousEvidence as Record<string, unknown>)
      : {};
  const now = new Date().toISOString();
  const evidence = {
    version: 1,
    conversationId,
    plantId: plantId ?? null,
    startedAt: typeof previous.startedAt === 'string' ? previous.startedAt : now,
    updatedAt: now,
    userMessageId,
    assistantMessageId,
    photoAttachedThisTurn: !!input.imageUrl,
    state: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue,
    lastAssessment:
      state.stage === 'ASSESSMENT'
        ? (JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue)
        : ((previous.lastAssessment as Prisma.InputJsonValue | undefined) ?? null),
    note: 'Model summary of consultation; proposed treatment is not a completed user action.',
  };
  const data = {
    plantId: plantId ?? null,
    memoryValue: [state.stage, ...state.symptoms, state.suspectedCause]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 900),
    memoryType: AiMemoryType.PLANT_OBSERVATION,
    source: EvidenceSource.AI_INFERENCE,
    confidence: 0.5,
    status: MemoryStatus.ACTIVE,
    evidence,
  };
  return {
    where: { userId_scopeKey_memoryKey: { userId, scopeKey, memoryKey: consultationKey } },
    create: { userId, scopeKey, memoryKey: consultationKey, ...data },
    update: data,
  };
}
