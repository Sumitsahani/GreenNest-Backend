# Smart care reminders

Watering schedules are soil-check prompts, never proof that the soil is dry. Weather considers plant placement; a user's snooze overrides weather-adjusted timing without changing the last-watered timestamp.

- `POST /garden/plants/:id/care-response`: `WATERED` records care and resets the cycle; `SOIL_WET` records a note and defers 24 hours; `BUSY` requires an ISO `remindAt` in the next seven days.
- `GET/PATCH /garden/plants/care-timing`: saved IANA timezone and preferred follow-up hour (8–20). Default: Asia/Kolkata, 9 am. Suggestions require at least three watering logs in the same local hour and 60% of the last 20 logs. Plant onboarding history is excluded.
- The dispatcher runs every five minutes. It permits three notifications per care cycle, with at least 24 hours between follow-ups. Quiet hours are 21:00–08:00 in the saved timezone. A user response starts a new check-in cycle.
- Notifications are linked to the plant and remain available in the inbox when phone push is disabled. Recording watering or deferring marks previous unread care notifications read.
- A conditional database update prevents competing dispatchers or a response received during weather lookup from claiming the same reminder version. Legacy duplicate watering reminders are grouped by plant during dispatch.
- With a registered push device, the backend owns delivery. Local scheduling is a fallback for devices without remote registration. Both use quiet hours and capped follow-ups. App care actions cancel scheduled and displayed notifications for the plant, then refresh scheduling.

Migration: `20260907120000_smart_care_followups`. Regenerate Prisma before building. Run the updated API and app together. Notification acceptance by Expo is not a delivery receipt; phone delivery still needs device testing. Local fallback cannot learn about changes made on another device until it synchronizes, and a push already in transit cannot be recalled.

Device acceptance: allow notifications; make a soil check due; verify one alert and its plant link; snooze it; verify the pending card clears; record watering and verify old alerts disappear. Repeat with push disabled, app backgrounded, quiet hours, and an indoor plant during rainy weather.
