// Synthetic consultation only: no user account or plant records are mutated.
require('ts-node/register/transpile-only');
require('reflect-metadata');
const { writeFileSync } = require('node:fs');
const { AiResponseService } = require('../src/modules/ai/ai-response.service');
const {
  storedConsultation,
  consultationMemoryData,
} = require('../src/modules/ai/consultation-memory');
const assert = require('node:assert/strict');
async function main() {
  const service = new AiResponseService();
  const context = {
    garden: [],
    memories: [],
    intent: 'PLANT_HEALTH',
    plantId: 'synthetic-pothos',
    sourcesUsed: ['synthetic_fixture'],
    promptContext:
      'SYNTHETIC TEST. Current plant: Pothos. Location: indoor bright indirect light. It was purchased 3 months ago (not actual plant age). No soil, pot or symptom records yet. No photo is attached. Do not claim visual inspection.',
  };
  const questions = [
    'My pothos has yellow leaves.',
    'Only the lower old leaves have yellowed over the last week. I water daily and the soil stays wet for four days. I cannot upload a photo.',
    'The pot has one drainage hole that was blocked by compacted soil. Water does not drain out. There are no insects, webbing or sticky residue. New leaves look green. No recent fertilizer, repotting or movement.',
    'I cleared the drainage hole and checked moisture before watering for three days. No new leaves have turned yellow and the stem is firm. What should I monitor now?',
  ];
  const history = [];
  const report = {
    date: new Date().toISOString(),
    kind: 'synthetic live provider consultation',
    turns: [],
  };
  let previous = null;
  for (const question of questions) {
    const start = Date.now();
    const result = await service.consult(
      question,
      context,
      undefined,
      history,
      'ENGLISH',
      previous,
    );
    report.turns.push({
      question,
      reply: result.reply,
      stage: result.consultation?.stage,
      ms: Date.now() - start,
    });
    if (report.turns.length === 1) {
      assert.equal(result.consultation?.stage, 'INVESTIGATING');
      assert.equal(result.consultation.treatment.length, 0);
    }
    assert.ok(result.consultation, 'Consultation state is required');
    const expectedStages = ['INVESTIGATING', 'INVESTIGATING', 'ASSESSMENT', 'FOLLOW_UP'];
    assert.equal(result.consultation.stage, expectedStages[report.turns.length - 1]);
    // Mimic persistence/restart: next round sees only a decoded stored snapshot + recent messages.
    const memory = consultationMemoryData({
      userId: 'synthetic',
      conversationId: 'synthetic',
      state: result.consultation,
      userMessageId: 'user',
      assistantMessageId: 'assistant',
    });
    previous = storedConsultation(JSON.parse(JSON.stringify(memory.create.evidence)));
    assert.ok(previous, 'Stored consultation must survive serialization');
    history.push({ role: 'USER', content: question }, { role: 'ASSISTANT', content: result.reply });
    writeFileSync('plant-doctor-live.json', JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify({
        turn: report.turns.length,
        stage: result.consultation.stage,
        ms: Date.now() - start,
      }),
    );
  }
  report.passed = true;
  writeFileSync('plant-doctor-live.json', JSON.stringify(report, null, 2));
}
void main().catch((error) => {
  console.error(error.name + ': consultation validation failed');
  process.exitCode = 1;
});
