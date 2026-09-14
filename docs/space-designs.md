# Space Designer — Phase 3

Phase 3 creates a `DesignScene` from the user's saved `SpaceScene` and selected plant recommendations. Room geometry and plant choices stay fixed. A separate explicit image-generation action edits the original room photo with realistic plants using Gemini's image model. Its status and private storage path are added under `scene.render`; generated pixels never change the placement data.

## API

All routes require the existing Supabase bearer token and enforce space ownership.

| Method | Path under `/api/v1` | Behavior |
| --- | --- | --- |
| POST | `/spaces/:id/designs` | Validate selected recommendations and create/save a snapshot |
| GET | `/spaces/:id/designs` | Latest 50 design summaries, newest first |
| GET | `/spaces/:id/designs/:designId` | Load the saved scene for this user and space |
| POST | `/spaces/:id/designs/:designId/image` | Generate and privately save an edited room photo; no request body |
| GET | `/spaces/:id/designs/:designId/image` | Read render status and a fresh signed image URL; never generates |

Create body:

```json
{
  "requestId": "44444444-4444-4444-8444-444444444444",
  "title": "Balcony plants",
  "style": "MINIMAL",
  "carePreference": "EASY",
  "recommendationIds": ["33333333-3333-4333-8333-333333333333"]
}
```

Use the same request UUID and payload after a network failure. Repeating it returns the saved design and creates no second engagement event. Changed input with the same identifier returns 409. The client never submits a scene, product details, or ownership identity.

Only recommendations from this space and the requested style/care preference are accepted. Choose one plant per available zone, up to eight. Inactive products and recommendations scoring below 60 for light, space, or environment are rejected. These checks inherit Phase 2 estimates; they are not a guarantee of plant survival or measured room suitability.

## Scene and preview

`schemaVersion: 1`, `coordinateSystem: PHOTO_NORMALIZED`. Bounding boxes are `[left, top, width, height]` between 0 and 1. Position uses the zone's bottom center. No world dimensions or depth are fabricated. Invalid or unknown boxes produce a null position and an unpositioned plant in the legend. Existing room geometry, environmental estimates, warnings, bilingual reasons, and plant details are saved in the snapshot.

Styles retain the Phase 2 plant ranking and choose example planter colors/shapes. The primary preview is a generated room image, with an Original photo toggle. The earlier numbered 2D zone guide and product legend remain available behind View placement guide. The app labels the generated image as an AI preview, since actual plant appearance and size can vary.

The image provider uses `gemini-3.1-flash-image` by default (`GEMINI_IMAGE_MODEL`). It uses `GEMINI_IMAGE_API_KEY` when supplied, otherwise the existing `GEMINI_API_KEY`. A project with image-generation quota is required; text-model quota does not enable image generation. No automatic provider/key rotation or paid fallback occurs. See the official [Gemini image-generation guide](https://ai.google.dev/gemini-api/docs/image-generation).

To check provider access, run `npx ts-node --project tsconfig.json scripts/check-design-image-access.ts`. This makes one potentially billable live image request using a bundled plant photo, never a user room photo. It reports only success or a sanitized error. The configured project's check on September 8, 2026 returned HTTP 429 (image quota unavailable); no live generated-room result has been verified. Enable image quota on the project or configure an image-enabled project key, then restart the backend before testing the app.

The original photo is read from the private `space-photos` bucket using the authenticated user's bearer token. Bundled `/catalog/*.png` plant photos are supplied as references when present, alongside names/species and normalized placement boxes. Arbitrary external catalog URLs are not fetched. Generation uses the Interactions API with `store: false`, a 120-second provider timeout, and no automatic retries. Valid PNG/JPEG/WebP output is saved privately under the user's folder using existing storage RLS. The model output is not promised to match every placement exactly.

Render claims use atomic JSON comparison to prevent duplicate concurrent calls across API instances. Completed output is reused, including after a client timeout. Failed/interrupted renders offer manual retry; a crashed process claim expires after five minutes. Signing an existing image does not call the provider. There is no durable job queue: an interrupted deployment may require a manual retry. No extra Prisma migration is required for render metadata.

Saved scenes survive recommendation regeneration and can be reopened or compared two at a time. Original photo URLs are signed afresh using the existing private upload flow; signed URLs are not stored in the scene.

## Setup and verification

Apply `npm run prisma:migrate:deploy`, generate the normal Prisma client with `npm run prisma:generate`, then restart the backend. On Windows, stop the development backend before generating if its Prisma DLL is locked. Do not generate an engine-free client for this PostgreSQL runtime.

Automated tests cover geometry validation, unsuitability, ownership filters, stale recommendations, HTTP validation, and unauthenticated endpoints. Run the real database smoke check with:

```sh
npx ts-node --project tsconfig.json scripts/check-space-designs.ts
```

It requires the configured database and an active seeded product. It creates temporary fixture rows inside a transaction, verifies save/reload/retry/event behavior and persistence after recommendation deletion, then rolls back. It does not use an AI provider or existing user photos.

Manual device test: open a completed saved space, request plant suggestions, choose plants, give the design a name, and tap Create & save design. Tap Generate room photo. Check Generated photo / Original photo, reopen the saved design, and confirm no new generation occurs. Save a variation, select both designs, and compare. Check Hindi, large system font, image retry, quota failure and reconnect after a failed save.

Physical-device interaction and live AI-provider success require separate device/provider verification. Phase 4 3D and Phase 5 natural-language edits are outside this change.
