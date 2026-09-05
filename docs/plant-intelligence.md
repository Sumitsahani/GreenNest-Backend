# Plant intelligence foundation

GreenNest treats each `GardenPlant` as a durable identity rather than a disposable card. Removing a plant from the active garden changes its lifecycle status and disables reminders; events, photos, outcomes, recommendations, and memories remain available for future learning.

## Evidence model

Every learned record carries a source and confidence. Sources distinguish explicit user statements and corrections, user actions, system events, plant analysis, and AI inference. User corrections are high-confidence evidence. AI inference remains lower-confidence and is always described as uncertain. A single action is not promoted to a user pattern; repeated evidence is required.

Current structured plant state has priority over historical memory. Same-species history is supporting evidence only and never overrides current photos, symptoms, soil observations, care events, or lifecycle state.

## Recommendation lifecycle

The deterministic next-best-action engine evaluates current health, watering history, schedule, strong plant observations, and optional weather evidence. It returns one explainable action with priority, confidence, reason, and the signal names used.

Recommendations move through generated/shown, accepted/rejected/skipped/dismissed, completed, and optional outcome states. Recent responded recommendations are not regenerated for 24 hours, preventing duplicate actions. “Soil is still wet” feedback is stored as plant-scoped evidence and can override a due watering schedule.

## Authenticated API

All routes are under `/api/v1` and enforce ownership using the authenticated Supabase user ID.

- `GET /garden/today`
- `GET /garden/plants/:id/intelligence`
- `GET /garden/plants/:id/memory`
- `POST /garden/plants/:id/events`
- `POST /garden/plants/:id/photos`
- `PATCH /garden/plants/:id/lifecycle`
- `POST /garden/plants/:id/outcomes`
- `POST /recommendations/:id/action`
- `GET /users/me/gardening-profile`
- `POST /ai/feedback`

Existing AI memory privacy controls remain available at `GET/PATCH/DELETE /ai/memories`. Delete archives a memory so it is no longer retrieved.

## Runtime approach

Gemini remains the generation provider and runs only on the server. The application does not retrain Gemini. Durable memory, evidence ranking, deterministic rules, and relevant context assembly provide continuous personalization without a vector database or separate AI service.
