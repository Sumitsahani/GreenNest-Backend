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

## Implemented and verified

- Existing email/password login redirects trusted ADMIN sessions to `/admin`. The requested initial account is provisioned in Supabase and AdminStaff. Credentials are not embedded in the app. No public administrator signup exists.
- Seven staff roles have server-enforced permissions; inactive staff lose access. Legacy gardener approval and payout endpoints also enforce staff permissions. The last active super administrator cannot be disabled or demoted.
- Responsive sidebar/table workspace with real aggregate metrics, searchable paginated records, date filters, record details, loading/error states, refresh, and export of the current filtered page.
- Order transitions and cancellation with atomic stock restoration and earned-point reversal; product creation/edit/archive, stock adjustments, gardener approval/suspension, service and banner creation/editing, early booking cancellation, existing payout recording, support replies/status, single-recipient in-app notification drafts with send confirmation, staff role changes, and transactional audit history.
- Read access to customer summaries, plants and intelligence state, AI conversations/feedback, recommendations/outcomes, gardener ratings, rewards ledger, and database health. Revenue is explicitly order/service value, not payment settlement.
- Migration deployed to the configured database. Live HTTP checks: anonymous admin access 401; requested account login 200 with ADMIN role; admin profile, overview, reports, customers, staff, audits and health 200. Resource lists also checked against the actual schema.
- Backend production TypeScript compilation and changed-module lint passed. Full backend suite: 43 suites / 212 tests passed; after two additional boundary tests, focused admin suite: 9 tests passed. Frontend TypeScript passed; lint has no errors and six existing unrelated warnings. Expo web and Android exports passed. Phone/browser visual interaction has not been verified.

## Remaining scope from the master specification

This is an operational first version, not completion of every master-spec feature. No refund provider or settlement ledger, inventory reservation model, product/service review moderation, bulk/scheduled/push campaigns, coupon management, provider failure history, or full analytics chart suite is implemented. Customer account suspension/editing, staff invitations/creation UI, manual rewards adjustment, advanced booking assignment/rescheduling, AI memory management, and cross-domain end-to-end browser tests remain. CSV exports one page, not an asynchronous full-dataset report. Additional staff are provisioned through the server-side script, then managed in the panel.

## Running locally

Backend: `npm run start:dev` from GreenNest-Backend. Frontend: `npx expo start --clear` from GreenNest-App, or `npx expo start --web` for the desktop workspace. Sign in through the normal login form. The frontend API URL must target the running backend. The existing installed APK does not include these source changes; a new APK build is needed for standalone installation.
