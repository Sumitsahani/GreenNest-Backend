# GreenNest Backend API

NestJS REST API for the GreenNest mobile application. It provides Supabase authentication,
PostgreSQL persistence, garden care, commerce, address management, gardener bookings, banners,
and user-uploaded media support.

## Tech stack

- NestJS 11 and TypeScript
- Prisma ORM with Supabase PostgreSQL
- Supabase Auth and Storage
- Swagger/OpenAPI
- Jest and Supertest
- Class Validator and Joi configuration validation

## Implemented modules

- **Authentication** — phone OTP, Google/Supabase sessions, token refresh, logout, and profile metadata
- **Account** — user preferences and notification settings
- **Catalog** — categories, products, search/filter data, and app banners
- **Cart** — authenticated cart creation and quantity updates
- **Wishlist** — user-owned saved products
- **Addresses** — create, edit, delete, and select a default delivery/service address
- **Orders** — checkout records and user order history
- **Garden** — durable plant identities, lifecycle state, photo/care timelines, outcomes, reminders, and explainable next-best actions
- **AI assistant** — Gemini-backed chat with relevant user/plant memory, evidence provenance, same-species history, and feedback
- **Services** — gardening-service catalog, slots, bookings, gardener assignment, and booking photos
- **Media** — Supabase `user-photos` bucket with per-user upload/update/delete policies

## API and static assets

- REST base URL: `http://localhost:3000/api/v1`
- Health check: `GET /api/v1/health`
- Swagger UI: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs-json`
- Static banners: `/banners/*`
- Static product images: `/catalog/*`

Generated shared API types are written to:

```text
packages/shared-types/src/generated/api.ts
```

## Local setup

Requirements:

- Node.js 20+
- A Supabase project
- PostgreSQL pooler and direct database URLs

Install and configure:

```bash
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run start:dev
```

On macOS/Linux, replace `copy` with `cp`.

Set these values in `.env`:

```env
PORT=3000
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
MOBILE_APP_ORIGIN=exp://localhost:8081
```

Never commit real Supabase secrets, database passwords, service-role keys, or user tokens.

## Database migrations

Prisma migrations cover:

- Product catalog and wishlist
- Cart and addresses
- Orders
- Garden plants, care events, and reminders
- Gardening services and bookings
- Account settings and notifications
- Backend-managed app banners
- Supabase user-photo bucket and RLS policies
- Service-booking photo attachments
- Plant intelligence, recommendation lifecycle, evidence-backed memory, outcomes, and relationships

Apply production migrations with:

```bash
npm run prisma:migrate:deploy
```

## Development commands

```bash
npm run start:dev          # Start the API in watch mode
npm run build              # Compile the production build
npm run lint               # Run ESLint
npm test                   # Run the test suite
npm run test:contract      # Run API contract tests
npm run prisma:validate    # Validate the Prisma schema
npm run contract:generate  # Regenerate OpenAPI and shared client types
```

## Security

- Protected modules use the Supabase bearer-token guard.
- Address, cart, wishlist, garden, order, and booking data is scoped to the authenticated user.
- Storage RLS restricts uploads and mutations to the user's own folder.
- Request validation rejects unknown or invalid fields.
- Helmet, CORS, request IDs, structured errors, and rate limiting are enabled.

## Related repository

GreenNest mobile frontend:

```text
https://github.com/Sumitsahani/GreenNest-App
```
