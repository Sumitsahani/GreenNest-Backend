# GreenNest Backend API

Production-oriented API contract foundation for the GreenNest mobile and web clients.

## Architecture

- NestJS modular monolith
- REST under `/api/v1`
- Prisma with Supabase PostgreSQL
- Swagger UI at `/api/docs`
- OpenAPI JSON at `/api/docs-json`
- Generated client types in `packages/shared-types/src/generated/api.ts`

## Setup

1. Copy `.env.example` to `.env`.
2. Replace the database placeholders with URL-encoded Supabase credentials.
3. Run `npm run prisma:generate`.
4. Run `npm run start:dev`.

Keep `DATABASE_CONNECT_ON_STARTUP=false` while working only on API contracts. Set it to
`true` after valid database credentials are configured.

## Contract commands

```bash
npm run contract:generate
npm run test:contract
npm run lint
npm run build
```

Business modules are intentionally not included in this foundation milestone. Authentication is
the next module.
