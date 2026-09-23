# Individual watering intelligence — engineering report

## Audit and root cause

Previous flow: plant creation generated a care plan → persisted `wateringDays` and `lastWateredAt + wateringDays` → individual care and batch care repeated that arithmetic → weather reminders independently shifted that date → garden summary/AI read the stored date → frontend rendered “Water [date]”. Care Timeline also calculated its own date.

Actual watering histories, current observations and pot context were not inputs to these date calculations. Same baseline plus same watering day necessarily produced the same date. A default seven-day baseline also made unrelated plants look identical. This was not a shared species cache: it was repeated fixed-interval arithmetic. Additional problems found: outdoor humidity affected indoor plants; plant detail backfill treated creation time as last watering when history was unknown; a 24-hour recommendation cache could preserve obsolete advice; a learned “dries in X days” memory was incorrectly treated as wet soil.

## Implementation and affected modules

- `garden/watering-engine.ts`: one deterministic calculation function and bounded evidence query shape. No random schedule offsets, Gemini calls or new schedule database.
- `garden/garden.service.ts`, controller and DTOs: history-based responses and writes; paginated plant lists (`?page=1`, 100/page); validated watering observations; preserve unknown watering; idempotent care events with client-supplied UUIDs.
- `garden/weather-care.service.ts`: uses the same engine; geographic forecasts only influence explicitly outdoor plants. Rain effects also require reported direct rain exposure. Shared weather fetch/cache remains location-based, not personalized-state based.
- `intelligence/plant-state`, `next-best-action`, `garden-intelligence`, `plant-intelligence`: independent state, meaningful NO_ACTION, approaching count, current evidence instead of blindly reusing a stored WATER recommendation. Garden summary supports up to 500 active plants.
- `intelligence/care-session` and DTO/controller: reuse existing sessions/items, record actual supplied occurrence time, per-plant recalculation after a batch, client-action replay protection, selected-plant corrections that preserve other plants, whole-session undo remains available for 15 minutes.
- `notifications/care-reminder-dispatcher`: current plant evidence, bounded candidate pagination, grouped delivery, one garden notification per configured local day under a database transaction lock. Chat calendar dates and displayed window dates also use the configured care timezone. Existing preferences, quiet hours and cycle limits remain active.
- `ai/ai-context`, `ai-care-action`, `ai.service`: authoritative state in plant-specific context; remove stale garden-wide dates from prompts; explicit whole-garden statements use sessions; explicit plant drying observations are stored as USER_CORRECTION. Existing relevant-memory retrieval is reused.
- Frontend `src/api/garden.ts`, plant detail, `WateringContextCard`, Garden Today, Batch Care, Care Timeline and notification synchronization: status first, estimated windows second; reasons; soil/pot/light corrections; whole-garden/zone recording with exceptions; partial correction; no independent watering interval arithmetic; local notification aggregation by day.

## Calculation policy

Recent per-plant care events supply up to 12 eligible watering gaps. Multiple timestamps within 18 hours are treated as one episode for learning. Zero or one interval does not personalize the baseline. Two or three intervals blend weakly (35%), four use 60%, and five or more use 75%. The median limits sensitivity to unusual gaps. These are observed care habits, **not measured drying**; the explanation says so.

Reported drying days are strong evidence, with reduced influence after 90 days. Reported light, soil and pot material shift a soil-check window conservatively, with the combined pot/light adjustment capped at two days. Relevant humidity/heat and exposed outdoor rain can shift it further. Wet/moist observations expire after two days or a newer watering. Wet soil blocks watering; relevant root/overwatering history changes due advice to inspection. Unknown last watering produces UNCERTAIN, never a fabricated confirmed event. Low health also requests inspection. Confidence and a date range express uncertainty.

The numerical bounds and blending weights are transparent product heuristics, not a calibrated soil-moisture model. Directional factors are supported by [University of Maryland Extension](https://www.extension.umd.edu/resource/watering-indoor-plants) and its [potting guidance](https://www.extension.umd.edu/resource/potting-and-repotting-indoor-plants); those sources do not establish our numerical coefficients. Seasonal effects are represented by actual light/environment/history; the engine does not guess a season from server month.

Identical evidence can correctly produce identical windows. Nothing forces dates to differ.

## Database and migration

No schema migration, destructive backfill or new database table. Reuse `CareEvent`, `PlantEvent`, memories, outcomes, `CareSession`, session items and reminders. Corrections are structured `PlantEvent` records (`watering_context`, source USER_CORRECTION). Existing UUID primary keys support optional `clientActionId`; transaction locks serialize care writes and session replay. Existing clients remain accepted without that optional field, but only clients supplying stable action IDs have retry deduplication guarantees.

`nextWateringAt` remains a backward-compatible soil-check hint. Current responses also carry `wateringState`. Do not interpret the legacy field as an instruction to water. Old records personalize on read from existing history; no user data was deleted or reseeded.

Set `WATERING_DEBUG=true` to log calculation inputs/results by plant ID (baseline, evidence count, adjustments, risk, status, confidence, windows and version). Normal UI shows explanations rather than calculation coefficients.

## Before and after example

Both pots watered September 18, baseline seven days:

| Evidence | Previously | New estimated soil-check window |
| --- | --- | --- |
| Repeated four-day gaps | September 25 | September 21–24 |
| Repeated nine-day gaps | September 25 | September 24–29 |
| Fresh wet-soil observation | Fixed date still shown | Do not water yet |
| No confirmed watering history | Creation date sometimes used | Check soil; last watering unknown |

Examples use the deterministic test clock, without environmental adjustments. Windows may overlap because uncertainty is real.

## Validation

Latest full backend run: **205 passed, 42 suites**. Frontend: **56 passed, 19 suites**. Backend TypeScript build, frontend typecheck and targeted production-file lint passed. Android production JavaScript/Hermes export succeeded (1,769 modules) at `C:\GN\watering-preview-export`; this is a bundle export, not an installed APK. The final full run includes configured-timezone/DST parsing, individual-care retry protection and newest-soil-evidence precedence.

Automated coverage includes 30-, 57- and 500-pot scenarios; independent histories with a shared final watering date; environment/pot differences; indoor/outdoor weather separation; correction ageing; wet soil; root risk; unknown history; no action; deterministic output; session replay and ownership; selected-plant undo; 57 plants producing one notification; local-day notification suppression. HTTP contract tests exercise correction validation, persistence through a mocked Prisma adapter, served-state recalculation and ownership. These are not live PostgreSQL integration tests.

Commands, from the relevant repository:

```powershell
# Backend
npm test -- --silent
npx tsc -p tsconfig.build.json
npm run build
# Targeted ESLint was run on the changed production modules.

# Frontend
npm run typecheck
npm test -- --runInBand --silent
npx expo export --platform android --output-dir C:\GN\watering-preview-export
# Targeted ESLint was run on the changed screens, API and components.

# Device availability
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

`npm run build` hits a Windows EPERM lock while Prisma tries to replace its already-loaded query-engine DLL. No schema changed; the direct TypeScript build uses the existing generated client. No running user backend was terminated.

## Remaining release checks and limits

- No Android device was attached, so real-phone flows, delivery permissions and full phone/server/database E2E remain unverified. Test with two same-species plants with distinct histories, record a garden session, report one wet pot, then correct a skipped pot and verify only its history changes.
- There is no existing durable offline care outbox. The new request IDs support retries and supplied occurrence timestamps; single-care pending IDs survive retries in the current process, and batch IDs survive retries on the current screen. They are not a guarantee of offline capture across app termination. Failed writes are not reported as saved.
- Rules are conservative estimates, not sensor certainty or horticulturally calibrated coefficients. Repeated watering can reflect user habit rather than actual dryness.
- Main summary and smart reminders cover up to 500 active plants; lists paginate. Bulk writes still perform per-item transaction writes and need real-database load testing at the upper limit.
- Whole-garden chat recognition is deliberately limited to unambiguous English statements; ambiguous statements retain the existing clarification path. Zone recording is available in Batch Care UI.
- No production migration/deployment, Git push or replacement APK was performed in this task. Previously hidden live-map UI stays hidden.
