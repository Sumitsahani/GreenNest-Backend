# Admin control center ? architecture audit

Audited before implementation, 2026-09-18.

Authentication uses Supabase Auth, not a local User table. NestJS verifies bearer sessions with Supabase; trusted app_metadata.role supplies existing ADMIN identity. Public signup only sets customer metadata. Existing customer/gardener role selection is navigation, not authority.

Existing source of truth:
- Commerce: Category, Product (active archive flag, stock), CartItem, Order, OrderItem, Address. Order status is PLACED/CONFIRMED/PACKED/OUT_FOR_DELIVERY/DELIVERED/CANCELLED. No payment settlement/refund ledger, reservation ledger, coupon or product-review model exists. Do not fabricate collected revenue, refunds, or reviews.
- Garden: GardenPlant, CareEvent, PlantEvent, PlantPhoto, PlantOutcomeRecord, PlantRecommendation, RecoveryCheckpoint, PlantRelationship; intelligence services build authorized plant state. Weather/device records are separate.
- Services: GardeningService, Gardener, ServiceBooking, BookingActivity, GardenerPayout. Existing gardener service owns verification, payout validation and booking state rules.
- AI: AiConversation, AiMessage, AiUserMemory, AiFeedback. Credentials are server configuration; never return them.
- Operations: SupportConversation/SupportMessage, Notification/PushDevice, Banner, RewardTransaction/RewardRedemption, UserSettings.
- Existing privileged routes: gardener verification and payout use broad ADMIN role; support uses an agent key. New staff permissions must cover legacy gardener routes too.

Implementation direction: reuse Supabase login, provision one staff identity out of band, add staff-role and append-only audit persistence, guarded /admin APIs, database-side aggregation and pagination, and a responsive Expo web-compatible /admin shell. No public admin registration and no email-only authorization. The existing public login routes successful admins to the admin shell using backend role verification.

Unavailable capabilities must be identified in API/UI rather than supplied with fake data. Stock reservation, actual refunds and provider-wide health/error history require real underlying integrations.

## Initial implementation and verification, 2026-09-18

- Existing email/password login redirects trusted ADMIN sessions to `/admin`. The requested initial account is provisioned in Supabase and AdminStaff. Credentials are not embedded in the app. No public administrator signup exists.
- Seven staff roles have server-enforced permissions; inactive staff lose access. Legacy gardener approval and payout endpoints also enforce staff permissions. The last active super administrator cannot be disabled or demoted.
- Responsive sidebar/table workspace with real aggregate metrics, searchable paginated records, date filters, record details, loading/error states, refresh, and export of the current filtered page.
- Order transitions and cancellation with atomic stock restoration and earned-point reversal; product creation/edit/archive, stock adjustments, gardener approval/suspension, service and banner creation/editing, early booking cancellation, existing payout recording, support replies/status, single-recipient in-app notification drafts with send confirmation, staff role changes, and transactional audit history.
- Read access to customer summaries, plants and intelligence state, AI conversations/feedback, recommendations/outcomes, gardener ratings, rewards ledger, and database health. Revenue is explicitly order/service value, not payment settlement.
- Migration deployed to the configured database. Live HTTP checks: anonymous admin access 401; requested account login 200 with ADMIN role; admin profile, overview, reports, customers, staff, audits and health 200. Resource lists also checked against the actual schema.
- Backend production TypeScript compilation and changed-module lint passed. Full backend suite: 43 suites / 212 tests passed; after two additional boundary tests, focused admin suite: 9 tests passed. Frontend TypeScript passed; lint has no errors and six existing unrelated warnings. Expo web and Android exports passed. Phone/browser visual interaction has not been verified.

## Management completion, 2026-09-23

The existing admin panel now supports the pending management actions using the existing database models:

- Customers: edit name/location, suspend or restore app access, and filter active/suspended accounts. Suspension is trusted app metadata, checked by backend authentication on protected HTTP requests and new tracking connections; login/session mapping also rejects suspended accounts. It is an application access restriction, not deletion or a provider-wide ban. Verified email/phone and credentials are never changed by the profile form.
- Staff: a super administrator can add an existing, verified, active account by email, choose one of seven roles, and confirm the grant. Membership, trusted ADMIN metadata and the audit entry commit together. Existing staff are edited in place; the final active super administrator remains protected. No invitation email or temporary password is generated. New users register and verify their own email before being added.
- Bookings: assign/reassign an eligible gardener and reschedule unstarted visits, with the same allocation lock, service/area/working-hours checks and overlap checks used by gardener workflows. Reassignment returns the booking to GARDENER_ASSIGNED for acceptance. Every change records the operator and reason in visit activity and the admin audit. Started/completed visits cannot be reassigned.
- Rewards: append positive/negative ledger adjustments, with a stable retry key and the same per-customer balance lock as redemption. Duplicate retries do not apply points twice; deductions cannot make the current balance negative. Finance administrators and super administrators can adjust rewards.
- AI memory: correct remembered text, archive/supersede or restore memory with an audit trail. No hard deletion.
- Categories: create, edit, reorder and deactivate categories; product forms provide a searchable category picker, sale price and pet-safety controls. Customer and gardener selectors use paginated, permission-checked lookup APIs.
- Reporting and usability: real aggregate bar charts, valid status choices, state-dependent order/notification/payout actions, explicit save feedback, validated inclusive date filters, and both page/all-results CSV downloads. All-results export uses a repeatable-read snapshot and is limited to 10,000 matching records; narrow filters for larger datasets.
- Expo web login now uses browser tab session storage; Android/iOS retain SecureStore. Local Expo web resolves the API from the browser hostname, while an explicit EXPO_PUBLIC_API_URL remains authoritative. Staff access is rechecked every 30 seconds in the admin screen.

No new migration is required. A read-only check against the configured database confirmed the required schema and SELECT/metadata UPDATE permissions on auth.users. Customer/staff operations never write passwords, verified contact fields, tokens, or auth identities.

Validation: backend production build and changed-file lint passed; 45 backend suites / 238 tests passed. Frontend TypeScript, changed-file lint, 22 suites / 69 tests, and Expo web/Android exports passed. A real Chromium browser exercised the exported web app at desktop and 390px mobile widths: login, refresh/session persistence, customer suspension, staff confirmation, gardener assignment, CSV download and logout. Browser APIs were intercepted with test fixtures; no live customer records or staff grants were changed. Screenshots are local review artifacts under GreenNest-App/.expo/admin-review/screenshots. Backend HTTP contract tests use the real controller, validation and service permission checks against a test database adapter. Native device interaction has not been tested on a physical phone.

## Integrations outside the current management scope

Refund processing/settlement, inventory reservations, review moderation, bulk/scheduled/push campaigns, coupons, provider failure history and asynchronous large report jobs still require their underlying integrations or models. The panel does not fabricate these capabilities. First-account bootstrap remains the server-side provision-admin.cjs script; routine additional staff creation is available in the panel.

## Running locally

Backend: `npm run start:dev` from GreenNest-Backend. Frontend: `npx expo start --clear` from GreenNest-App, or `npx expo start --web` for the desktop workspace. Sign in through the normal login form. The frontend API URL must target the running backend. The existing installed APK does not include these source changes; a new APK build is needed for standalone installation.
