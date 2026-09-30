# Performance and loading fixes

Date: 2026-09-27. Changes are in the local backend and Expo app. The updated backend is running on port 3000; hosted production has not been deployed.

## What was found

- Concurrent GET requests reproduced Supabase session-pool exhaustion: `EMAXCONNSESSION`, pool size 15. Both old and initial comparison servers returned some HTTP 500s while sharing that pool. The database URL had no connection limit. Running two servers amplified pressure, so those initial numbers are not a clean production baseline.
- The app could wait 25 seconds locally or 60 seconds on Render for each request, then retry. Session refresh and retry could add more waiting.
- Supabase background refresh and the app's separate refresh path could rotate credentials independently. Late 401 responses could trigger another unnecessary token refresh.
- Weather requests could block garden responses for two 8-second attempts. Their timeout stopped after headers, leaving response-body reads unbounded. App weather requests had no deadline.
- Font errors and stalled storage reads could hold the startup screen indefinitely.

## Changes

- Prisma now defaults to four connections per process, a five-second pool wait, and a five-second connection timeout. Explicit URL settings are preserved. `DATABASE_CONNECTION_LIMIT` configures the default; budget the total across all replicas and other clients.
- Pool exhaustion maps to a retryable HTTP 503 instead of a generic 500.
- Concurrent verification of the same bearer token shares one Supabase request. Completed authorization decisions are not cached, preserving suspension checks.
- Product list and count run concurrently. Plant intelligence reuses the recommendations already loaded with plant state.
- Backend weather fetches, retries, and body reads share a three-second budget; existing plant-history fallback remains available.
- Development startup skips runtime type checking. `npm run typecheck` remains a separate production-source check.
- HTTP logs now measure from middleware through completion, including guards, and record the final response status.
- App requests have hard deadlines that settle even if native fetch ignores cancellation: normal API calls 15 seconds; the default complete authenticated operation 20 seconds including refresh. Longer explicit AI/image budgets are retained.
- Identical concurrent GETs share a request, scoped by headers, locale, and options. Results are not retained after completion. Automatic query retries no longer repeat timeouts, cancellation, or authentication errors.
- The app refreshes expiring JWTs before sending requests, shares refresh work, and reuses tokens refreshed by another request. Supabase automatic background refresh is disabled so it does not independently rotate the stored app credentials. JWT decoding is only a scheduling hint; server verification remains required.
- Email and Google SDK steps have deadlines. Font loading can fall back after five seconds or on error; language storage falls back after three seconds; secure storage operations have a five-second deadline.
- App weather and geocoding requests also have deadlines, including body parsing.

## Verification

- Backend: 243 tests passed across 46 suites; the added exception-filter suite separately passed its two tests (245 total).
- App: 83 tests passed across 24 suites; the added weather-timeout suite separately passed its two tests (85 total). Session tests were rerun after adding late-refresh cleanup assertions.
- Backend production-source and app TypeScript checks passed. Targeted ESLint checks passed after resolving test lint issues.
- Updated authenticated read audit: 47 distinct successful customer-accessible GET routes, 12 denied by role/key restrictions, seven unprobed routes. Successful repeats are included in `api-audit-auth-optimized.json`.
- Final single-server burst: 100 authenticated GET requests, concurrency 20, 100 HTTP 200 responses; median 276 ms, p95 673 ms, maximum 1537 ms. See `performance-smoke.json`.
- Final health request returned HTTP 200 in about 64 ms.

Small warm-request comparison (five samples per endpoint per server):

| Route | Before median | After median |
| --- | ---: | ---: |
| Products | 137 ms | 68 ms |
| Garden today | 364 ms | 320 ms |
| Garden plants | 249 ms | 253 ms |
| Orders | 124 ms | 125 ms |
| Plant intelligence | 303 ms | 297 ms |

These samples show a clear product-list improvement; other differences are small and include normal network variation. They are not production load-test guarantees. After restart, one background reminder dispatch logged a transient database-connect error; subsequent API checks and all 100 burst requests succeeded. Physical-phone reopen and browser interaction were not manually exercised.

## Running and deployment

- Backend: `npm run start:dev` from `GreenNest-Backend`. It is already running in the background; logs are in `backend-runtime.log` and `backend-runtime-errors.log`. Stop the existing instance before starting another on port 3000.
- Reload the existing Expo app/browser to pick up frontend changes. Use the PC LAN address from a physical phone. Use `127.0.0.1:3000` on this PC because another application occupies IPv6 localhost port 3000.
- `render.yaml` still specifies the free plan. Render says free services sleep after 15 minutes idle and can take about one minute to wake: https://render.com/docs/free#spinning-down-on-idle. Removing that hosted cold start requires changing the compute plan; no billing or deployment change was made.
- The earlier full-repository TypeScript check includes an existing gardener integration script with stale constructor calls. The new `typecheck` command checks the production source configuration; it does not claim that script is fixed.
- Write workflows, privileged admin/gardener workflows, and external AI latency were not benchmarked with this customer account. No database migrations or indexes were changed.
