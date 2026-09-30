export type ConsultationStage = 'GENERAL' | 'INVESTIGATING' | 'ASSESSMENT' | 'FOLLOW_UP';
export const factTopics = [
  'identity',
  'symptom_duration',
  'symptom_distribution',
  'watering_history',
  'soil_condition',
  'drainage',
  'light',
  'recent_changes',
  'pest_signs',
  'root_condition',
  'treatment_response',
  'other',
] as const;
export type ConsultationFocus =
  'WATERING_DRAINAGE' | 'PESTS' | 'NUTRITION' | 'LIGHT_ENVIRONMENT' | 'AGING' | 'OTHER';
export interface Consultation {
  stage: ConsultationStage;
  focus: ConsultationFocus;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  opening: string;
  questions: string[];
  photoRequests: string[];
  knownFacts: { key: string; value: string; source: 'USER' | 'RECORD' | 'PHOTO' }[];
  symptoms: string[];
  suspectedCause: string;
  evidence: string[];
  alternatives: string[];
  missingEvidence: string[];
  confirmation: string[];
  treatment: string[];
  avoid: string[];
  monitoring: string[];
  followUp: string;
  userActions: string[];
  expectedResponse: string;
  outcome: string;
  homeRemedy: string;
}
const textFields = [
  'opening',
  'suspectedCause',
  'followUp',
  'expectedResponse',
  'outcome',
  'homeRemedy',
] as const;
const listFields = [
  'questions',
  'photoRequests',
  'symptoms',
  'evidence',
  'alternatives',
  'missingEvidence',
  'confirmation',
  'treatment',
  'avoid',
  'monitoring',
  'userActions',
] as const;
export const consultationSchema = {
  type: 'OBJECT',
  required: ['stage', 'focus', 'confidence', 'knownFacts', ...textFields, ...listFields],
  properties: {
    stage: { type: 'STRING', enum: ['GENERAL', 'INVESTIGATING', 'ASSESSMENT', 'FOLLOW_UP'] },
    focus: {
      type: 'STRING',
      enum: ['WATERING_DRAINAGE', 'PESTS', 'NUTRITION', 'LIGHT_ENVIRONMENT', 'AGING', 'OTHER'],
    },
    confidence: { type: 'STRING', enum: ['LOW', 'MEDIUM', 'HIGH'] },
    ...Object.fromEntries(textFields.map((key) => [key, { type: 'STRING' }])),
    ...Object.fromEntries(
      listFields.map((key) => [key, { type: 'ARRAY', items: { type: 'STRING' } }]),
    ),
    knownFacts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['key', 'value', 'source'],
        properties: {
          key: { type: 'STRING', enum: factTopics },
          value: { type: 'STRING' },
          source: { type: 'STRING', enum: ['USER', 'RECORD', 'PHOTO'] },
        },
      },
    },
  },
};
export const consultationOutputInstruction = `Return only the requested JSON schema, with all user-facing values in the configured response language. Never put a diagnosis or remedy in opening/questions/photoRequests while INVESTIGATING. Empty unknown values, no invented evidence. knownFacts is a cumulative concise list of observations with provenance (USER, RECORD, PHOTO), never instructions or unverified diagnoses. Preserve answered questions and reported actions from the prior record; update corrected facts rather than asking again. Keep the record specific to the current plant and episode.
GENERAL is only for a non-problem question or small talk; opening contains the brief answer and all diagnostic fields stay empty. A new problem or insufficient/conflicting evidence requires INVESTIGATING: 2-4 purposeful questions (one is allowed if it is the sole remaining gap), at most 3 specific photo views, and no suspectedCause/treatment/homeRemedy. Group a photo request within the question budget if already asking four questions. Each question must depend on this user's history and answers. Record missingEvidence and symptoms, not a premature diagnosis.
The focus is the leading investigation area, not a confirmed cause. Use canonical knownFacts keys from the schema; a fact value must be an actual observation, never "unknown". Before an assessment of WATERING_DRAINAGE obtain identity, watering_history, soil_condition and drainage facts; PESTS needs actual pest_signs; NUTRITION needs distribution/recent changes; LIGHT_ENVIRONMENT needs light/recent changes; AGING needs distribution/duration. Only ask about missing checks relevant to this focus, never repeat an answered checklist. Existing records may supply facts. Do not relabel the focus to evade missing evidence. Do not diagnose root rot without direct root observations; damp soil alone supports only a watering/drainage hypothesis. Even HIGH confidence is not certainty; avoid "confirms" and "definitely" for inferred causes.
ASSESSMENT/FOLLOW_UP requires an earlier investigation, MEDIUM/HIGH confidence, supporting evidence, safe confirmation, 2-5 treatment/home-care steps (monitoring/no intervention is valid), avoid, monitoring and a concrete followUp. No critical missingEvidence may remain. FOLLOW_UP after an assessment can have zero treatment steps when no new treatment is needed: retain the previous suspectedCause and known facts, add only reported actions/outcomes, and provide monitoring/followUp. Never invent two treatments merely to fill the schema. Do not restart a follow-up with "Let us diagnose it properly first"; acknowledge reported changes and ask only what still matters. Do not repeat questions in opening and questions. Root examination is permitted only for already safely exposed roots; never imply uprooting just to confirm a suspicion. Explain the most likely cause and relevant alternative briefly. Distinguish proposed treatment/homeRemedy from userActions actually reported; outcome stays empty until observed. If treatment fails or a different problem appears, return to INVESTIGATING. Never claim a reminder was scheduled. Do not reproduce internal chain-of-thought, only brief findings and evidence.`;
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function parseConsultation(
  text: string,
  options: { previous?: Consultation | null; hasImage?: boolean; healthQuestion?: boolean } = {},
): Consultation {
  const value: unknown = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!isRecord(value)) throw new Error('Consultation must be an object');
  if (
    !['GENERAL', 'INVESTIGATING', 'ASSESSMENT', 'FOLLOW_UP'].includes(String(value.stage)) ||
    !['LOW', 'MEDIUM', 'HIGH'].includes(String(value.confidence))
  )
    throw new Error('Invalid consultation stage/confidence');
  for (const key of textFields)
    if (typeof value[key] !== 'string' || value[key].length > 900)
      throw new Error('Invalid consultation text');
  for (const key of listFields)
    if (
      !Array.isArray(value[key]) ||
      value[key].length > 12 ||
      value[key].some((item) => typeof item !== 'string' || !item.trim() || item.length > 500)
    )
      throw new Error('Invalid consultation list');
  if (
    !Array.isArray(value.knownFacts) ||
    value.knownFacts.length > 30 ||
    value.knownFacts.some(
      (fact) =>
        !isRecord(fact) ||
        typeof fact.key !== 'string' ||
        !fact.key ||
        fact.key.length > 80 ||
        !factTopics.includes(fact.key as (typeof factTopics)[number]) ||
        typeof fact.value !== 'string' ||
        !fact.value ||
        fact.value.length > 500 ||
        !['USER', 'RECORD', 'PHOTO'].includes(String(fact.source)),
    )
  )
    throw new Error('Invalid consultation facts');
  if (
    !['WATERING_DRAINAGE', 'PESTS', 'NUTRITION', 'LIGHT_ENVIRONMENT', 'AGING', 'OTHER'].includes(
      String(value.focus),
    )
  )
    throw new Error('Invalid consultation focus');
  const result = value as unknown as Consultation;
  if (
    result.photoRequests.length > 3 ||
    result.questions.length + (result.photoRequests.length ? 1 : 0) > 4
  )
    throw new Error('Too many consultation questions');
  if (result.opening.length > 500) throw new Error('Keep the opening short');
  if (
    !options.hasImage &&
    result.knownFacts.some(
      (fact) =>
        fact.source === 'PHOTO' &&
        !options.previous?.knownFacts.some(
          (old) => old.source === 'PHOTO' && old.key === fact.key && old.value === fact.value,
        ),
    )
  )
    throw new Error('New visual observations need an attached image');
  if (result.stage === 'GENERAL') {
    if (
      options.healthQuestion ||
      result.symptoms.length ||
      result.suspectedCause ||
      result.treatment.length ||
      result.homeRemedy
    )
      throw new Error('Plant problems require investigation');
  } else if (result.stage === 'INVESTIGATING') {
    if (
      !result.questions.length ||
      result.suspectedCause ||
      result.treatment.length ||
      result.homeRemedy
    )
      throw new Error('Investigate before diagnosis or treatment');
  } else {
    if (
      result.stage === 'FOLLOW_UP' &&
      !['ASSESSMENT', 'FOLLOW_UP'].includes(options.previous?.stage ?? '')
    )
      throw new Error('Follow-up requires a previous assessment');
    if (!options.previous || options.previous.stage === 'GENERAL')
      throw new Error('A new problem needs an investigation first');
    const required: Record<ConsultationFocus, string[]> = {
      WATERING_DRAINAGE: ['identity', 'watering_history', 'soil_condition', 'drainage'],
      PESTS: ['identity', 'pest_signs'],
      NUTRITION: ['identity', 'symptom_distribution', 'recent_changes'],
      LIGHT_ENVIRONMENT: ['identity', 'light', 'recent_changes'],
      AGING: ['identity', 'symptom_distribution', 'symptom_duration'],
      OTHER: ['identity'],
    };
    const topics = new Set(
      result.knownFacts
        .filter(
          (fact) =>
            !/^(?:unknown|not known|unsure|not provided|not available)$/i.test(fact.value.trim()),
        )
        .map((fact) => fact.key),
    );
    const wateringCause = /water|drain|root|paani|pani|jad|जड़|पानी|जलभराव/i.test(
      result.suspectedCause,
    );
    const missing = [
      ...new Set([...required[result.focus], ...(wateringCause ? required.WATERING_DRAINAGE : [])]),
    ].filter((topic) => !topics.has(topic));
    if (missing.length)
      throw new Error('Assessment requires recorded facts: ' + missing.join(', '));
    if (
      /root rot|root-rot|जड़.*सड़|jad.*sad/i.test(result.suspectedCause) &&
      !topics.has('root_condition')
    )
      throw new Error(
        'Root rot needs direct root observations; ask or retain a less specific hypothesis',
      );
    if (
      !topics.has('root_condition') &&
      [...result.confirmation, ...result.treatment].some(
        (step) =>
          /\b(?:check|inspect|examine|look at)\b[^.]*\broots?\b/i.test(step) &&
          !/already (?:exposed|removed)|without (?:uprooting|removing|disturbing)|through (?:the )?drainage/i.test(
            step,
          ),
      )
    )
      throw new Error(
        'Root inspection must be limited to roots already safely exposed; use a non-invasive confirmation',
      );
    if (
      result.confidence === 'LOW' ||
      result.missingEvidence.length ||
      !result.suspectedCause ||
      !result.evidence.length ||
      !result.confirmation.length ||
      (result.stage === 'ASSESSMENT' && result.treatment.length < 2) ||
      result.treatment.length > 5 ||
      !result.monitoring.length ||
      !result.followUp
    )
      throw new Error('Assessment needs sufficient evidence and a complete follow-up plan');
  }
  return result;
}
export function renderConsultation(
  value: Consultation,
  language: 'ENGLISH' | 'HINDI' | 'HINGLISH',
): string {
  const headings =
    language === 'HINDI'
      ? [
          'फोटो',
          'क्या पाया',
          'सबसे संभावित समस्या',
          'क्यों',
          'पुष्टि कैसे करें',
          'अभी क्या करें',
          'क्या न करें',
          'क्या देखें',
          'फॉलो-अप',
        ]
      : language === 'HINGLISH'
        ? [
            'Photo',
            'Kya mila',
            'Sabse mumkin problem',
            'Kyun',
            'Kaise confirm karein',
            'Abhi kya karein',
            'Kya na karein',
            'Kya monitor karein',
            'Follow-up',
          ]
        : [
            'Photos',
            'What I found',
            'Most likely problem',
            'Why',
            'How to confirm',
            'What to do now',
            'What to avoid',
            'What to monitor',
            'Follow-up',
          ];
  const section = (heading: string, items: string[]): string =>
    items.length ? `### ${heading}\n${items.map((item) => `- ${item}`).join('\n')}` : '';
  if (value.stage === 'GENERAL') return value.opening;
  if (value.stage === 'INVESTIGATING')
    return [
      value.opening,
      value.questions.map((question, i) => `${i + 1}. ${question}`).join('\n'),
      section(headings[0]!, value.photoRequests),
    ]
      .filter(Boolean)
      .join('\n\n');
  if (value.stage === 'FOLLOW_UP')
    return [
      value.opening,
      value.outcome,
      section(headings[5]!, value.treatment),
      section(headings[6]!, value.avoid),
      section(headings[7]!, value.monitoring),
      section(headings[8]!, [value.followUp]),
    ]
      .filter(Boolean)
      .join('\n\n');
  return [
    value.opening,
    section(headings[1]!, value.symptoms),
    section(headings[2]!, [value.suspectedCause]),
    section(headings[3]!, value.evidence),
    section(headings[4]!, value.confirmation),
    section(headings[5]!, value.treatment),
    section(headings[6]!, value.avoid),
    section(headings[7]!, value.monitoring),
    section(headings[8]!, [value.followUp]),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function mentionsPlantProblem(question: string): boolean {
  return /yellow|brown|droop|wilt|dying|disease|fung|root rot|pest|insect|webbing|leaf drop|sticky|peel[ae]|murjha|keed|पीली|पीले|मुरझा|कीड़े|सड़न|रोग|धब्बे/i.test(
    question,
  );
}
