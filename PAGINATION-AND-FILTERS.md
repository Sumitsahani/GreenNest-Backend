# Pagination and filters

## Response and validation

The collection endpoints below return `data: { items, meta }` inside the existing `{ success, data }` envelope. `meta` contains `page`, `limit`, `total`, `totalPages`, `hasNextPage`, and `hasPreviousPage`.

- `page=1`, `limit=20` by default; maximum limit 100 and page 100000.
- `search` searches relevant text fields, case-insensitively.
- `sort=newest|oldest` selects the order. A unique ID resolves equal sort values.
- `from` and `to` accept ISO dates/timestamps. A date-only `to` includes the entire UTC day. Reversed ranges and invalid query values return HTTP 400.
- Counts use the same owner and filters as the rows. Reads use database `skip`/`take` and return only the requested page.
- Every private list remains scoped to the authenticated user. Nested conversations and designs check ownership before reading pages.

## Endpoints

Paths are relative to `/api/v1`. All listed endpoints accept the common parameters above unless noted.

| GET endpoint | Additional filters / search fields |
| --- | --- |
| `/orders` | `status` (order status or ACTIVE); order number and product names |
| `/bookings` | `status` (booking status, ACTIVE, HISTORY), `sortBy=createdAt|scheduledAt`; booking number/service title; date range applies to scheduled time |
| `/notifications` | `unread=true|false`, `type`; title/message |
| `/addresses` | Label, address and postal code; default address sorts first |
| `/wishlist` | `category` slug; product name; products must remain active |
| `/garden/plants` | `location`, `environment=INDOOR|OUTDOOR`, lifecycle `status`; name/species/location; default ACTIVE and MOVED |
| `/services` | `category`; service title; active services only |
| `/spaces` | Analysis `status`; search matches declared/detected space type labels |
| `/spaces/:id/designs` | `style`; design title |
| `/ai/conversations` | Conversation title |
| `/ai/conversations/:id/messages` | Message content; sequence ordering |
| `/ai/memories` | Memory key/value; active memories only |
| `/support/conversations` | `status=OPEN|CLOSED`; subject |
| `/support/conversations/:id/messages` | Message text; acknowledges only the returned unread support/system replies |
| `/support/admin/conversations` | `status`; subject; existing support-agent authorization required |
| `/rewards/transactions` | Transaction title |
| `/rewards/redemptions` | Redemption title |
| `/gardener/jobs` | Booking status, search customer/booking/service, `sortBy`; active jobs assigned to verified gardener |
| `/gardener/history` | Same parameters, restricted to closed jobs; date range applies to scheduled time |

`/products` retains its existing page/limit, category, search, minPrice, maxPrice, featured and product sort filters. Boolean `featured=false` and zero-price filters now work correctly. Product ordering now has an ID tie-breaker and returns navigation flags. Product date filters are not supported.

`/garden/plants/summary` is a new small aggregate: `{total, healthy, locations}` for ACTIVE/MOVED plants. Home and Garden use it for complete counts and location choices without downloading every plant.

Existing admin pagination, gardener earnings and activity pagination remain available. Detail records, cart totals, settings, small category/banner lists, fixed service slots and care/dashboard aggregates retain their existing shapes.

## App integration

- Shop, Garden, Services, Orders, Bookings, Service History, Notifications, Addresses, Saved Spaces, Saved Designs, Rewards and Gardener Jobs load pages on demand.
- Existing order/service/category/location filters now query the server; list search is debounced. Notifications offer All/Unread/Read, and bookings offer All/Upcoming/History.
- Filter values form part of the query cache key, so changing them starts at page 1.
- Load-more failures preserve loaded records and allow retry; records are deduplicated by ID across pages.
- AI and support open recent messages first and expose **Load older messages**. Conversation histories also load further pages on demand.
- Home fetches a six-plant preview. The active visit banner requests the earliest active booking and the server total.
- Address/service/plant selection and batch-care workflows intentionally use complete-list adapters, fetching all pages with a limit of 100. Wishlist membership indicators use the same adapter. They do not silently truncate at the first page.

## Examples

```text
/api/v1/orders?page=1&limit=20&status=ACTIVE&search=rose
/api/v1/bookings?page=1&status=HISTORY&from=2026-09-01&to=2026-09-30
/api/v1/notifications?page=1&unread=false
/api/v1/garden/plants?page=2&limit=20&environment=OUTDOOR
/api/v1/products?page=1&limit=20&category=indoor-plants&maxPrice=500
```

## Run and release

Restart the existing backend terminal with Ctrl+C, then `npm run start:dev`. Reload the Expo app. Do not start a second backend on port 3000. The checked running server was left untouched; live validation used a temporary random local port and closed it afterwards.

**Deploy backend and app together:** several list response bodies changed from arrays to `{items, meta}`. All known Expo callers were updated. Any separately deployed client must adopt this contract before using the new backend. No database migration is required. These are local changes; production deployment is not included.

OpenAPI and shared generated types are updated via `npm run contract:generate`.

## Verification

Final runs: **279 backend tests**, **89 app tests**, **57 authenticated live checks** passed. Both projects pass TypeScript checks; changed files pass targeted ESLint.

- Backend HTTP tests cover collection envelopes, bounds, default values, stable ordering, filter/count scoping, invalid status/dates, true/false booleans, ownership checks and complete garden summaries.
- Frontend hook tests cover on-demand loading, duplicates, query reset on filter change, retry after a failed next page and complete-list adapters.
- `pagination-live.json` records authenticated real-database checks without credentials, tokens or response contents. `scripts/pagination-smoke.cjs` accepts login JSON via stdin, starts the current source on an ephemeral port and always closes it.
- Live checks cover customer-accessible lists; privileged support/gardener lists were not exercised with elevated credentials. A phone UI walkthrough and production load test were not performed.
- Offset pages can shift as records are inserted or updated; refreshing re-reads pages. This is not a snapshot export.
