# Vriksha Plant Doctor consultation

The customer AI chat now investigates plant problems before recommending treatment. The supplied policy is preserved in `plant-doctor-consultation-policy.txt`.

## Response flow

- `GENERAL`: short greetings and general care answers.
- `INVESTIGATING`: adaptive questions and specific photo requests, using existing plant history. Usually 2–4 questions; one is allowed when only one important fact is missing. No diagnosis, treatment or home remedy in this stage.
- `ASSESSMENT`: an evidence-supported likely cause, confirmation, 2–5 practical actions, things to avoid, monitoring and follow-up.
- `FOLLOW_UP`: compare reported actions and outcomes with the prior assessment. Monitoring alone is allowed when no new treatment is needed.

Gemini returns structured JSON. Server validation checks stages, bounded question counts, evidence sources and the information required for the suspected cause. For example, watering problems need identity, watering history, soil condition and drainage. Root rot requires direct root observations. Photos cannot establish unseen roots or soil moisture.

One repair attempt is allowed. If the output remains invalid, the API returns a retryable error instead of displaying an unvalidated diagnosis. The app gives this consultation request an 85-second deadline to accommodate the provider and repair attempt.

## Memory and app behavior

The accepted assistant reply and consultation summary are saved together in the existing request-claim transaction. Superseded requests cannot overwrite the summary. Memory is scoped to the authenticated user, conversation and plant.

The existing `AiUserMemory.evidence` JSON stores dates, symptoms, facts and their sources, suspected cause, confidence, treatment, remedy, reported actions, expected response, follow-up and outcome. It also retains the last assessment. Model summaries are marked `AI_INFERENCE`; recommended actions are separate from actions the user reports completing.

Reopening a chat restores its plant context. Opening the doctor for a different plant resets the screen. Prior plant consultations are included as dated, uncertain history. No database migration or public API shape change is required.

## Verification

Run `npm test` and `npm run typecheck` in the backend and app. Consultation tests cover stage validation, premature remedies, missing drainage, root observations, language continuity, persistence, ownership and superseded requests.

`node --env-file=.env scripts/plant-doctor-smoke.cjs` runs a four-turn synthetic Pothos consultation against the configured AI provider. It writes `plant-doctor-live.json` and does not mutate user or plant records. The tested flow progresses through investigation, drainage clarification, assessment and follow-up, including a serialized memory round trip.

The live check exercises text consultation; it does not establish diagnostic accuracy across plants, test real photographs, or replace an on-device check. Structured validation catches missing fields and selected unsupported claims; semantic accuracy and natural phrasing still depend on the model.

## Run locally

Stop the existing backend with Ctrl+C in its terminal, then run `npm run start:dev`. Reload the Expo app to use the updated chat. Starting another backend on the occupied port 3000 will still produce `EADDRINUSE`.
