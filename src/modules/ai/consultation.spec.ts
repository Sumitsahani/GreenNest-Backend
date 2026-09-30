import { parseConsultation, renderConsultation, type Consultation } from './consultation';
import {
  consultationMemoryData,
  consultationScope,
  storedConsultation,
} from './consultation-memory';
export const investigation: Consultation = {
  stage: 'INVESTIGATING',
  focus: 'WATERING_DRAINAGE',
  confidence: 'LOW',
  opening: "Let's diagnose it properly first.",
  questions: [
    'How long have the lower leaves been yellow?',
    'Does the soil stay wet between waterings?',
  ],
  photoRequests: ['A full-plant photo and a close-up of an affected leaf'],
  knownFacts: [{ key: 'identity', value: 'Pothos', source: 'RECORD' }],
  symptoms: ['Yellow lower leaves'],
  suspectedCause: '',
  evidence: [],
  alternatives: [],
  missingEvidence: ['Soil condition'],
  confirmation: [],
  treatment: [],
  avoid: [],
  monitoring: [],
  followUp: 'Reply with your observations.',
  userActions: [],
  expectedResponse: '',
  outcome: '',
  homeRemedy: '',
};
const assessment: Consultation = {
  ...investigation,
  stage: 'ASSESSMENT',
  knownFacts: [
    { key: 'identity', value: 'Pothos', source: 'RECORD' },
    { key: 'watering_history', value: 'Daily', source: 'USER' },
    { key: 'soil_condition', value: 'Wet four days', source: 'USER' },
    { key: 'drainage', value: 'Blocked hole', source: 'USER' },
  ],
  confidence: 'MEDIUM',
  questions: [],
  photoRequests: [],
  missingEvidence: [],
  suspectedCause: 'Persistent wet soil and slow drainage are the most likely cause.',
  evidence: ['User reports wet soil for four days and a blocked drainage hole'],
  confirmation: ['Inspect the drainage opening without disturbing roots'],
  treatment: [
    'Clear the obstructed drainage opening gently',
    'Recheck soil moisture before watering again',
  ],
  avoid: ['Do not add fertilizer while the cause is being checked'],
  monitoring: ['Watch for new yellow leaves or a soft stem'],
  followUp: 'Report new yellowing or a soft stem; send a new photo in three days.',
  expectedResponse: 'New yellowing should slow if drainage was the cause.',
};
describe('Consultation stage validation', () => {
  it('renders questions and specific photo requests without a premature treatment', () => {
    const result = parseConsultation(JSON.stringify(investigation));
    expect(renderConsultation(result, 'ENGLISH')).toContain('1. How long');
    expect(renderConsultation(result, 'ENGLISH')).not.toContain('What to do now');
  });
  it.each([
    { ...investigation, treatment: ['Use neem oil'] },
    { ...investigation, suspectedCause: 'Overwatering' },
    { ...investigation, homeRemedy: 'Use a soap spray' },
    { ...investigation, questions: ['1', '2', '3', '4', '5'] },
    { ...investigation, questions: [] },
  ])('rejects treatment or invalid questioning during investigation', (value) => {
    expect(() => parseConsultation(JSON.stringify(value))).toThrow();
  });
  it('requires an investigation before the first assessment', () => {
    expect(() => parseConsultation(JSON.stringify(assessment))).toThrow('investigation first');
    expect(parseConsultation(JSON.stringify(assessment), { previous: investigation }).stage).toBe(
      'ASSESSMENT',
    );
  });
  it.each([
    { ...assessment, confidence: 'LOW' },
    { ...assessment, missingEvidence: ['Current soil moisture'] },
    { ...assessment, evidence: [] },
    { ...assessment, confirmation: [] },
    { ...assessment, followUp: '' },
    { ...assessment, treatment: ['One action'] },
  ])('refuses an unsupported or incomplete assessment', (value) => {
    expect(() => parseConsultation(JSON.stringify(value), { previous: investigation })).toThrow();
  });
  it('refuses invented visual observations without a photo and accepts preserved prior observations', () => {
    const state = {
      ...investigation,
      knownFacts: [
        { key: 'symptom_distribution', value: 'Yellow lower leaves', source: 'PHOTO' as const },
      ],
    };
    expect(() => parseConsultation(JSON.stringify(state))).toThrow('attached image');
    expect(parseConsultation(JSON.stringify(state), { hasImage: true }).knownFacts).toEqual(
      state.knownFacts,
    );
    expect(parseConsultation(JSON.stringify(state), { previous: state }).knownFacts).toEqual(
      state.knownFacts,
    );
  });
  it('asks for drainage before assessing a watering problem', () => {
    const withoutDrainage = {
      ...assessment,
      knownFacts: assessment.knownFacts.filter((fact) => fact.key !== 'drainage'),
    };
    expect(() =>
      parseConsultation(JSON.stringify(withoutDrainage), { previous: investigation }),
    ).toThrow('drainage');
  });
  it('does not label wet soil as root rot without direct root observations', () => {
    expect(() =>
      parseConsultation(JSON.stringify({ ...assessment, suspectedCause: 'Root rot' }), {
        previous: investigation,
      }),
    ).toThrow('direct root observations');
  });
  it('does not ask to inspect hidden roots simply to confirm a diagnosis', () => {
    expect(() =>
      parseConsultation(
        JSON.stringify({ ...assessment, confirmation: ['Inspect roots for brown mushy tissue'] }),
        { previous: investigation },
      ),
    ).toThrow('safely exposed');
  });
  it('allows monitoring-only follow-up after an assessment', () => {
    const followup = {
      ...assessment,
      stage: 'FOLLOW_UP',
      treatment: [],
      userActions: ['Cleared drainage'],
      outcome: 'No new yellow leaves',
    };
    expect(parseConsultation(JSON.stringify(followup), { previous: assessment }).treatment).toEqual(
      [],
    );
    expect(renderConsultation(followup as Consultation, 'ENGLISH')).not.toContain('What to do now');
  });
  it('keeps recovery evidence without converting advice into actions', () => {
    const data = consultationMemoryData({
      userId: 'u',
      conversationId: 'c',
      plantId: 'p',
      state: assessment,
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
    });
    expect(data.create.source).toBe('AI_INFERENCE');
    expect(data.create.scopeKey).toBe(consultationScope('c', 'p'));
    expect(storedConsultation(data.create.evidence)?.userActions).toEqual([]);
    expect(storedConsultation(data.create.evidence)?.outcome).toBe('');
    expect(storedConsultation(data.create.evidence)?.followUp).toBe(assessment.followUp);
    expect(consultationScope('c', 'p')).not.toBe(consultationScope('c', 'other'));
  });
  it('renders Hindi headings without encoding placeholders', () => {
    expect(renderConsultation(assessment, 'HINDI')).toContain('क्या पाया');
    expect(renderConsultation(assessment, 'HINDI')).not.toContain('????');
  });
  it('rejects a diagnostic answer disguised as general chat', () => {
    expect(() =>
      parseConsultation(JSON.stringify({ ...investigation, stage: 'GENERAL' }), {
        healthQuestion: true,
      }),
    ).toThrow();
  });
});
