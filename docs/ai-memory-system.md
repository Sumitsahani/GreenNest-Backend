# GreenNest AI memory system

The V1 assistant keeps chat history and reusable user memory separate. It stores only explicit, stable gardening facts with high confidence; passwords, payment data, health data, and unrelated personal details are not extracted.

## Request flow

1. Authenticate the Supabase bearer token.
2. Classify the question and validate optional plant ownership.
3. Save the user message in `ai_messages`.
4. Extract explicit, stable user or plant-scoped memories with evidence and confidence.
5. Rebuild relevant context so a correction in the current message applies immediately.
6. Load authoritative current plant state, relevant memories, repeated patterns, and same-species history in that priority order.
7. Generate and save the assistant response together with its intent and source categories.

`AiResponseService` calls Gemini from the backend when `GEMINI_API_KEY` is configured. A deterministic fallback keeps the endpoint usable during provider outages. The secret is never sent to the mobile client. No conversation or memory is exported for model training beyond the context sent for the user's current Gemini request.

## API

All endpoints are under `/api/v1`, require a bearer token, and are scoped to the authenticated user.

- `POST /ai/conversations`
- `GET /ai/conversations`
- `GET /ai/conversations/:id/messages`
- `POST /ai/conversations/:id/messages`
- `GET /ai/memories`
- `PATCH /ai/memories/:id`
- `DELETE /ai/memories/:id`
- `POST /ai/feedback`

Run `npm run prisma:migrate:deploy` for deployed environments after reviewing the migration. Use `npm run prisma:migrate:dev` locally.
