# Visit Tracking

Tracking endpoints require the booking owner or assigned active gardener.
GPS sharing is foreground-only. A last point expires from the live response after
45 seconds and is deleted on arrival, cancellation, completion or explicit stop.

## Live delivery

The customer opens one WebSocket at `/api/v1/tracking/live`. Its first frame is
`{ "type": "subscribe", "bookingId": "UUID", "gardener": false, "token": "ACCESS_TOKEN" }`.
Tokens are sent in the frame, never in the URL. The server validates the token
with Supabase and checks booking ownership or active gardener assignment before
every snapshot. Sockets expire at token expiry or after five minutes, whichever
comes first. The client renews through the existing HTTP session-refresh flow.

After a location, destination, or job action commits, the server pushes a
`{ "type": "snapshot", "revision": 1, "data": { ...trackingResponse } }` frame.
Revisions are monotonic per socket. Reconnect sends the current state, not an
old queue of GPS points. Stale locations disappear after 45 seconds even if no
new point arrives. A 20-second heartbeat checks access/status and repairs missed
relay events; unchanged snapshots are not sent again.

The app disables location polling while the socket is connected, reconnects with
bounded exponential backoff, and falls back to 10-second HTTP refreshes if the
transport is unavailable. Route geometry still refreshes separately every 30
seconds. The marker interpolates between fixes without re-centering the camera;
GPS corrections larger than 500 metres snap instead of drawing false movement.
Uploads are limited to one per five seconds, reject old/low-accuracy device fixes,
and resume on the next fresh fix after temporary network failure.

## Deployment and scale

One backend process works without extra infrastructure. For multiple replicas,
set the same private `TRACKING_REDIS_URL` on every instance. Redis Pub/Sub relays
only changed booking IDs; each instance reads an authorized snapshot from the
shared database. Startup fails if a configured Redis instance cannot connect.
The reverse proxy must forward WebSocket upgrades and allow idle connections
longer than the 20-second heartbeat. Use HTTPS/WSS in production.

The latest GPS point remains an upserted PostgreSQL record; Redis is an event
relay, not the location store. Locks are per booking, so unrelated GPS updates
do not block all gardener allocation. This is not a Kafka/sharded fleet platform.
For a much larger fleet, benchmark first, then move hot points to Redis TTL keys
and add a durable event stream if replay/analytics is needed.

Restart the backend after installing dependencies (`npm install`, then
`npm run start:dev`). Restart Expo with `npx expo start`. Existing installed APKs
need a rebuild to include the new JS; no database migration is required.

## Device verification

Use two accounts and devices: assigned gardener and booking owner. Accept/start
the visit, open tracking, and enable sharing on the gardener device. Verify
movement on the customer device without refresh; pan the map to ensure it stays
put. Toggle connectivity, reconnect, stop sharing, arrive, and cancel. Verify
the marker clears, and another account cannot subscribe to the booking.
Sharing remains foreground-only and stops when leaving tracking or backgrounding
the app. Background/terminated-app GPS is not implemented by this change.

Road geometry uses OSRM. In development the public OSRM demo is used, with at most
one route request per visit/destination every 30 seconds. It receives the two
coordinates, not customer names, full addresses or credentials. Demo service
availability is not guaranteed. Route duration does not include live traffic.

Production requires OSRM_BASE_URL pointing to an approved hosted OSRM provider.
No routing provider is enabled by default in production. Do not use the demo as
a production dependency. Maps and GPS continue to work when routing is unavailable.

Expo Go includes the native map runtime. A standalone Android build needs a
restricted Google Maps SDK key and a rebuild. No key is embedded by this change.
