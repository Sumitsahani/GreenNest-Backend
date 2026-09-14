# Stability audit — 2026-09-12

Baseline: existing uncommitted Space Designer work and the home-card removal are preserved.
Code existence is not E2E evidence. Never log credentials, OTPs, tokens, or customer records.

| Area | Initial finding / verification required |
| --- | --- |
| Frontend → Backend | Current Wi-Fi is 192.168.1.103; local API config uses a stale fixed IP. |
| Backend Startup | Startup connection opt-out defaults to false; health relies on cached connection state. |
| Database | Previous P1001; test current SELECT 1 and migration status without dumping secrets. |
| Authentication | Provider failures become 401; logout clears app tokens but not Supabase session. |
| Email OTP | Missing; current login uses Supabase passwords. Implement requested Nodemailer OTP. |
| Phone OTP | Supabase SMS flow exists; provider/inbox not verified; static resend text is misleading. |
| Gemini | Existing provider and response normalization; live call still required. |
| Storage | Existing Supabase upload and RLS migrations; real photo round trip pending. |
| Plant CRUD | Create/read/soft-remove exist; ordinary edit API missing. |
| Plant AI | Existing image classification/normalization; real image test pending. |
| Plant Memory | Persisted events, correction sources, outcomes, relevant context exist. |
| Care | Existing actions/reminders; baseline tests required. |
| Batch Care | Excluded plants create skip events; reason-specific exceptions and undo need review. |
| AI Plant Buddy | Debounce merges separate messages; request IDs not persisted for deduplication; response check/write race. |
| Hindi/English | Existing translation and preference handling; device validation pending. |
| Notifications | Push code exists; Expo Go intentionally disables native notifications; device build required. |
| Shop | Catalog/filter/detail API exists; live data pending. |
| Cart | Quantity/ownership validation exists; concurrent checkout needs coverage. |
| COD Orders | Transaction exists but stock reads/decrements can race; request idempotency missing. |
| Rewards | Unique source reference exists; concurrent redemption balance check can race. |
| Gardener Booking | All slots reported available; allocation is not transactional. |
| Profile | Existing profile API; refresh/error and device flow pending. |
| Addresses | Ownership checks exist; default selection concurrency needs review. |
| Security | Review provider failures, ownership, safe errors, storage URLs, OTP concurrency. |

Initial device check: `adb devices -l` returned no connected devices.
