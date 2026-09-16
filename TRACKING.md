# Visit Tracking

Tracking endpoints require the booking owner or assigned active gardener.
GPS sharing is foreground-only. A last point expires from the live response after
45 seconds and is deleted on arrival, cancellation, completion or explicit stop.

Road geometry uses OSRM. In development the public OSRM demo is used, with at most
one route request per visit/destination every 30 seconds. It receives the two
coordinates, not customer names, full addresses or credentials. Demo service
availability is not guaranteed. Route duration does not include live traffic.

Production requires OSRM_BASE_URL pointing to an approved hosted OSRM provider.
No routing provider is enabled by default in production. Do not use the demo as
a production dependency. Maps and GPS continue to work when routing is unavailable.

Expo Go includes the native map runtime. A standalone Android build needs a
restricted Google Maps SDK key and a rebuild. No key is embedded by this change.
