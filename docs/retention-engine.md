# GreenNest retention engine

## Audit

The existing modular NestJS API, Prisma/PostgreSQL database, Expo app, Gemini integration, and authentication remain in place. Plant-level intelligence continues to come from `PlantStateService`, `NextBestActionService`, `PlantIntelligenceService`, `AiMemoryService`, and `AiContextService`. `PlantEvent`, `PlantOutcomeRecord`, `PlantRecommendation`, `PlantPhoto`, and `AiUserMemory` remain the source records.

The repository did not contain a production Plant Rescue or Space Designer module. Recovery now extends plant events and outcomes without creating a second diagnosis engine. No replacement Space Designer was introduced; future designs can emit the allow-listed analytics bridge events when that production feature exists.

## Garden intelligence

`GardenIntelligenceService` aggregates active plants in one bounded query, consumes current recommendations and learned signals, and uses the existing deterministic next-best-action service when an active recommendation is absent. It returns statuses, priorities, ordered attention items, action/location groups, a zero-action state, due recovery checkpoints, and evidence-backed progress updates. Results cache for 60 seconds and are invalidated by care, lifecycle, photo, outcome, recommendation, batch, and recovery mutations.

The endpoint is `GET /garden/today`. It supports up to 250 active plants and is tested at 1, 5, 20, 50, and 100 plants. `GET /garden/weekly-review` caches a deterministic weekly record in PostgreSQL and only marks the review meaningful when source events, new plants, supported progress, or current risk exists.

## Batch care and trust

`POST /garden/care-sessions` accepts the full due plant set plus only skipped exceptions. Every plant is ownership-checked before the transaction starts. Completed items create the existing `CareEvent` plus a `PlantEvent` with `source=USER_REPORTED`, `confidence=0.8`, timestamp, and session evidence. Skipped items create `WATERING_SKIPPED` events. A session never implies that excluded plants were watered.

`POST /garden/care-sessions/:id/undo` is available for 15 minutes. It restores watering state only when the session is still the latest watering, removes the derived care-history row, retains the original auditable session/event, and adds a `USER_CORRECTION` event.

## Recovery and progress

A `TREATMENT_APPLIED` event creates a day-7 checkpoint for ordinary cases and day-3, day-7, and day-14 checkpoints for plants whose current health is below 60. A declined or unknown checkpoint closes the remaining sequence, dismisses the repeated treatment, and creates an inspection/reassessment recommendation. Improvement is shown only from a recorded `IMPROVED`/`HEALTHY` outcome or explicit supported photo-analysis flags.

## Notifications

The dispatcher consumes Garden Intelligence before delivery. Eligible plant reminders for one user are claimed conditionally and sent as one garden-care notification. It retains quiet hours, a three-alert cycle cap, 24-hour follow-up spacing, snooze handling, action suppression, and device cleanup. The no-remote-token local fallback also groups same-day reminders.

## Chat

The app waits three seconds after the latest user bubble, combines rapid messages into one request, and allows a new message to abort an outdated client response. Each request carries an ID; the server does not persist an assistant answer if a newer request superseded it. Users can select Auto detect, English, or Hindi. Auto detection also supports Hinglish. The existing conversation, current PlantState, relevant memory, outcomes, recent recommendations, related history, and current garden context stay shared across languages.

## Analytics

`EngagementEvent` stores allow-listed product events, including Garden Today opens/actions, weekly review opens, history opens, and future Space Designer handoffs. Care completion/undo is written server-side. Weekly `GardenReview` records support garden health and retention analysis without optimizing for raw opens alone.

## Operational notes

Apply migration `20260907180000_retention_engine`, regenerate Prisma, regenerate the OpenAPI contract, and deploy the API and Expo app together because the Garden Today response contract changed. Expo push acceptance is not a delivery receipt, so Android/iOS device acceptance testing remains necessary.
