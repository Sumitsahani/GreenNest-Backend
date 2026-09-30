# Backend API audit

Date: 2026-09-27. Target: http://127.0.0.1:3000

## Results

- Running OpenAPI inventory: 139 operations.
- Live checks: 145; passed: 145.
- Automated tests: 238/238 across 45 suites.
- Live scope: 9 public reads, 123 missing-authentication checks, 7 empty authentication payloads, and 6 invalid-query/missing-resource checks.
- No valid user, gardener, administrator, or support credentials were supplied. Protected business behavior and latency remain unverified live. Tests use mocks and do not prove external integrations work.
- No user records were intentionally created, changed, or deleted. No valid OTP/email request was sent.
- Single-request timings are a smoke check, not a load test.

## Findings

- Production TypeScript configuration passes (`npx tsc -p tsconfig.build.json --noEmit`); it excludes the scripts directory.
- Full TypeScript check failed: scripts/check-gardener-integration.ts line 48 passes 3 arguments where 4–5 are required; line 87 passes 1 where 2 are required. All Jest tests passed despite these separate integration-script errors.
- Public reads completed in 35?253 ms during this run; products were slowest (253 ms). Product listing uses a database transaction for its list and count, and includes category data.
- Each SupabaseAuthGuard check fetches the Supabase user over the network, with a 10-second timeout. This dependency precedes the route handler.
- The HTTP logging interceptor starts after guards; its duration omits the authentication guard latency.
- Admin, tracking, and support-admin operations lack OpenAPI security requirements despite runtime guards. Missing credentials were rejected by the live checks.
- Earlier startup measurement: ts-node registration plus AppModule loading took 14.5 seconds, versus 5.8 seconds with transpile-only. This measures module loading, not full server readiness.
- Earlier localhost probe reached a different IPv6 listener and returned 404; 127.0.0.1 reached this backend. On a physical phone, use the PC LAN address.

## Every live check

| Method | Path | Check | HTTP | ms | Result |
| --- | --- | --- | --- | --- | --- |
| GET | /api/v1/products | public list | 200 | 253 | PASS |
| GET | /api/v1/services | public list | 200 | 80 | PASS |
| GET | /api/v1/admin/me | missing authentication | 401 | 17 | PASS |
| GET | /api/v1/admin/lookups/products | missing authentication | 401 | 16 | PASS |
| GET | /api/v1/admin/dashboard | missing authentication | 401 | 16 | PASS |
| GET | /api/v1/admin/reports | missing authentication | 401 | 12 | PASS |
| GET | /api/v1/admin/system | missing authentication | 401 | 14 | PASS |
| GET | /api/v1/admin/customers | missing authentication | 401 | 18 | PASS |
| GET | /api/v1/admin/customers/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 7 | PASS |
| GET | /api/v1/admin/products/export | missing authentication | 401 | 8 | PASS |
| GET | /api/v1/admin/products | missing authentication | 401 | 15 | PASS |
| POST | /api/v1/admin/products | missing authentication | 401 | 19 | PASS |
| GET | /api/v1/admin/products/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 13 | PASS |
| PATCH | /api/v1/admin/products/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 6 | PASS |
| GET | /api/v1/garden/today | missing authentication | 401 | 10 | PASS |
| GET | /api/v1/garden/weekly-review | missing authentication | 401 | 16 | PASS |
| POST | /api/v1/garden/care-sessions | missing authentication | 401 | 16 | PASS |
| POST | /api/v1/garden/care-sessions/00000000-0000-4000-8000-000000000000/undo | missing authentication | 401 | 17 | PASS |
| POST | /api/v1/garden/recovery-checkpoints/00000000-0000-4000-8000-000000000000/complete | missing authentication | 401 | 15 | PASS |
| POST | /api/v1/engagement/events | missing authentication | 401 | 17 | PASS |
| GET | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/intelligence | missing authentication | 401 | 17 | PASS |
| GET | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/memory | missing authentication | 401 | 16 | PASS |
| POST | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/events | missing authentication | 401 | 16 | PASS |
| POST | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/photos | missing authentication | 401 | 15 | PASS |
| PATCH | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/lifecycle | missing authentication | 401 | 16 | PASS |
| POST | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/outcomes | missing authentication | 401 | 15 | PASS |
| POST | /api/v1/recommendations/00000000-0000-4000-8000-000000000000/action | missing authentication | 401 | 7 | PASS |
| GET | /api/v1/users/me/gardening-profile | missing authentication | 401 | 8 | PASS |
| POST | /api/v1/ai/feedback | missing authentication | 401 | 5 | PASS |
| GET | /api/v1/gardener/access | missing authentication | 401 | 11 | PASS |
| GET | /api/v1/gardener/profile | missing authentication | 401 | 15 | PASS |
| PATCH | /api/v1/gardener/profile | missing authentication | 401 | 16 | PASS |
| POST | /api/v1/gardener/register | missing authentication | 401 | 16 | PASS |
| GET | /api/v1/gardener/dashboard | missing authentication | 401 | 17 | PASS |
| GET | /api/v1/gardener/jobs | missing authentication | 401 | 14 | PASS |
| GET | /api/v1/gardener/history | missing authentication | 401 | 15 | PASS |
| GET | /api/v1/gardener/earnings | missing authentication | 401 | 18 | PASS |
| GET | /api/v1/gardener/availability | missing authentication | 401 | 7 | PASS |
| PATCH | /api/v1/gardener/availability | missing authentication | 401 | 8 | PASS |
| GET | /api/v1/gardener/jobs/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 17 | PASS |
| GET | /api/v1/gardener/jobs/00000000-0000-4000-8000-000000000000/activities | missing authentication | 401 | 17 | PASS |
| POST | /api/v1/gardener/jobs/00000000-0000-4000-8000-000000000000/accept | missing authentication | 401 | 6 | PASS |
| POST | /api/v1/gardener/ai/chat | missing authentication | 401 | 10 | PASS |
| GET | /api/v1/bookings/00000000-0000-4000-8000-000000000000/visit | missing authentication | 401 | 14 | PASS |
| POST | /api/v1/bookings/00000000-0000-4000-8000-000000000000/visit/accept | missing authentication | 401 | 5 | PASS |
| PATCH | /api/v1/admin/gardeners/00000000-0000-4000-8000-000000000000/verification | missing authentication | 401 | 11 | PASS |
| POST | /api/v1/admin/gardener-payouts/00000000-0000-4000-8000-000000000000/paid | missing authentication | 401 | 17 | PASS |
| GET | /api/v1/bookings/00000000-0000-4000-8000-000000000000/tracking/route | missing authentication | 401 | 16 | PASS |
| GET | /api/v1/bookings/00000000-0000-4000-8000-000000000000/tracking | missing authentication | 401 | 12 | PASS |
| PUT | /api/v1/bookings/00000000-0000-4000-8000-000000000000/tracking/location | missing authentication | 401 | 17 | PASS |
| DELETE | /api/v1/bookings/00000000-0000-4000-8000-000000000000/tracking/location | missing authentication | 401 | 19 | PASS |
| PUT | /api/v1/bookings/00000000-0000-4000-8000-000000000000/tracking/destination | missing authentication | 401 | 12 | PASS |
| POST | /api/v1/ai/identify-plant | missing authentication | 401 | 9 | PASS |
| POST | /api/v1/ai/briefing | missing authentication | 401 | 9 | PASS |
| POST | /api/v1/ai/conversations | missing authentication | 401 | 13 | PASS |
| GET | /api/v1/ai/conversations | missing authentication | 401 | 6 | PASS |
| GET | /api/v1/ai/conversations/00000000-0000-4000-8000-000000000000/messages | missing authentication | 401 | 12 | PASS |
| POST | /api/v1/ai/conversations/00000000-0000-4000-8000-000000000000/messages | missing authentication | 401 | 14 | PASS |
| GET | /api/v1/ai/memories | missing authentication | 401 | 6 | PASS |
| PATCH | /api/v1/ai/memories/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 11 | PASS |
| DELETE | /api/v1/ai/memories/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 17 | PASS |
| GET | /api/v1/garden/plants/care-timing | missing authentication | 401 | 13 | PASS |
| PATCH | /api/v1/garden/plants/care-timing | missing authentication | 401 | 9 | PASS |
| POST | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/care-response | missing authentication | 401 | 7 | PASS |
| GET | /api/v1/garden/plants | missing authentication | 401 | 4 | PASS |
| POST | /api/v1/garden/plants | missing authentication | 401 | 12 | PASS |
| GET | /api/v1/garden/plants/smart-reminders | missing authentication | 401 | 4 | PASS |
| GET | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/smart-care | missing authentication | 401 | 12 | PASS |
| POST | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/watering/correction | missing authentication | 401 | 18 | PASS |
| GET | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/watering-state | missing authentication | 401 | 13 | PASS |
| GET | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 5 | PASS |
| DELETE | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 12 | PASS |
| PATCH | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 14 | PASS |
| POST | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/care-events | missing authentication | 401 | 9 | PASS |
| GET | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/reminders | missing authentication | 401 | 7 | PASS |
| POST | /api/v1/garden/plants/00000000-0000-4000-8000-000000000000/reminders | missing authentication | 401 | 14 | PASS |
| PATCH | /api/v1/garden/plants/reminders/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 18 | PASS |
| GET | /api/v1/support/conversations | missing authentication | 401 | 17 | PASS |
| POST | /api/v1/support/conversations | missing authentication | 401 | 16 | PASS |
| GET | /api/v1/support/conversations/00000000-0000-4000-8000-000000000000/messages | missing authentication | 401 | 14 | PASS |
| POST | /api/v1/support/conversations/00000000-0000-4000-8000-000000000000/messages | missing authentication | 401 | 15 | PASS |
| PATCH | /api/v1/support/conversations/00000000-0000-4000-8000-000000000000/close | missing authentication | 401 | 16 | PASS |
| PATCH | /api/v1/support/conversations/00000000-0000-4000-8000-000000000000/reopen | missing authentication | 401 | 16 | PASS |
| GET | /api/v1/support/admin/conversations | missing authentication | 403 | 6 | PASS |
| POST | /api/v1/support/admin/conversations/00000000-0000-4000-8000-000000000000/messages | missing authentication | 403 | 11 | PASS |
| GET | /api/v1/health | public read | 200 | 35 | PASS |
| GET | /api/v1/health/database | public read | 200 | 35 | PASS |
| POST | /api/v1/auth/register | empty input validation | 400 | 11 | PASS |
| POST | /api/v1/auth/login | empty input validation | 400 | 8 | PASS |
| POST | /api/v1/auth/otp/request | empty input validation | 400 | 8 | PASS |
| POST | /api/v1/auth/otp/verify | empty input validation | 400 | 5 | PASS |
| POST | /api/v1/auth/refresh | empty input validation | 400 | 22 | PASS |
| PATCH | /api/v1/auth/profile | missing authentication | 400 | 10 | PASS |
| POST | /api/v1/auth/logout | missing authentication | 401 | 22 | PASS |
| GET | /api/v1/auth/me | missing authentication | 401 | 14 | PASS |
| POST | /api/v1/auth/email/otp/request | empty input validation | 400 | 20 | PASS |
| POST | /api/v1/auth/email/otp/verify | empty input validation | 400 | 8 | PASS |
| GET | /api/v1/banners | public read | 200 | 74 | PASS |
| GET | /api/v1/categories | public read | 200 | 62 | PASS |
| GET | /api/v1/products/d40082ea-0fd5-4b32-b0c6-1776fd9b6476 | public read | 200 | 118 | PASS |
| GET | /api/v1/wishlist | missing authentication | 401 | 17 | PASS |
| POST | /api/v1/wishlist/items | missing authentication | 401 | 13 | PASS |
| DELETE | /api/v1/wishlist/items/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 16 | PASS |
| GET | /api/v1/cart | missing authentication | 401 | 5 | PASS |
| DELETE | /api/v1/cart | missing authentication | 401 | 35 | PASS |
| POST | /api/v1/cart/items | missing authentication | 401 | 10 | PASS |
| PATCH | /api/v1/cart/items/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 11 | PASS |
| DELETE | /api/v1/cart/items/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 20 | PASS |
| GET | /api/v1/addresses | missing authentication | 401 | 4 | PASS |
| POST | /api/v1/addresses | missing authentication | 401 | 8 | PASS |
| PATCH | /api/v1/addresses/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 5 | PASS |
| DELETE | /api/v1/addresses/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 12 | PASS |
| POST | /api/v1/orders | missing authentication | 401 | 8 | PASS |
| GET | /api/v1/orders | missing authentication | 401 | 12 | PASS |
| GET | /api/v1/orders/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 13 | PASS |
| GET | /api/v1/services/slots?date=2026-09-28 | public read | 200 | 100 | PASS |
| GET | /api/v1/services/dd5945e2-39c9-4ab6-9b0b-24f21c504f03 | public read | 200 | 61 | PASS |
| POST | /api/v1/bookings | missing authentication | 401 | 11 | PASS |
| GET | /api/v1/bookings | missing authentication | 401 | 15 | PASS |
| GET | /api/v1/bookings/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 16 | PASS |
| GET | /api/v1/settings | missing authentication | 401 | 14 | PASS |
| PATCH | /api/v1/settings | missing authentication | 401 | 14 | PASS |
| GET | /api/v1/notifications | missing authentication | 401 | 17 | PASS |
| PATCH | /api/v1/notifications/00000000-0000-4000-8000-000000000000/read | missing authentication | 401 | 16 | PASS |
| POST | /api/v1/notifications/read-all | missing authentication | 401 | 16 | PASS |
| GET | /api/v1/rewards | missing authentication | 401 | 14 | PASS |
| POST | /api/v1/rewards/redeem | missing authentication | 401 | 5 | PASS |
| POST | /api/v1/devices/push | missing authentication | 401 | 6 | PASS |
| POST | /api/v1/devices/push/unregister | missing authentication | 401 | 19 | PASS |
| POST | /api/v1/spaces/analyze | missing authentication | 401 | 17 | PASS |
| GET | /api/v1/spaces | missing authentication | 401 | 16 | PASS |
| POST | /api/v1/spaces/00000000-0000-4000-8000-000000000000/recommendations | missing authentication | 401 | 15 | PASS |
| GET | /api/v1/spaces/00000000-0000-4000-8000-000000000000/recommendations | missing authentication | 401 | 16 | PASS |
| POST | /api/v1/spaces/00000000-0000-4000-8000-000000000000/designs | missing authentication | 401 | 15 | PASS |
| GET | /api/v1/spaces/00000000-0000-4000-8000-000000000000/designs | missing authentication | 401 | 17 | PASS |
| GET | /api/v1/spaces/00000000-0000-4000-8000-000000000000/designs/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 14 | PASS |
| GET | /api/v1/spaces/00000000-0000-4000-8000-000000000000 | missing authentication | 401 | 17 | PASS |
| POST | /api/v1/spaces/00000000-0000-4000-8000-000000000000/designs/00000000-0000-4000-8000-000000000000/image | missing authentication | 401 | 13 | PASS |
| GET | /api/v1/spaces/00000000-0000-4000-8000-000000000000/designs/00000000-0000-4000-8000-000000000000/image | missing authentication | 401 | 15 | PASS |
| GET | /api/v1/products?page=0 | invalid query | 400 | 19 | PASS |
| GET | /api/v1/products?limit=10000 | invalid query | 400 | 13 | PASS |
| GET | /api/v1/services/slots?date=invalid | invalid query | 400 | 16 | PASS |
| GET | /api/v1/products/00000000-0000-4000-8000-000000000000 | missing resource | 404 | 60 | PASS |
| GET | /api/v1/services/00000000-0000-4000-8000-000000000000 | missing resource | 404 | 45 | PASS |
| GET | /api/v1/health/unknown-component | missing resource | 404 | 20 | PASS |
