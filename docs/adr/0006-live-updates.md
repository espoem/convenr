# ADR 0006: Live updates, chosen per instance

Status: accepted, 2026-11-19.

## Context

Since Phase 2 an open event page asks for the event's version every 15 seconds. Phase 4 wants changes to appear within seconds. Containers run one long-lived Node.js server next to PostgreSQL. The first public instance runs on Vercel Hobby with Neon Free (ADR 0005), whose free limits stop the whole service when they run out. No single technique is the best on both.

Facts read from the providers' documentation on 2026-11-19:

- **Vercel Hobby.** A function has 2 GB of memory and 1 vCPU, which Hobby cannot change, and runs at most 300 seconds of wall-clock time, streaming included. Provisioned memory is billed for an instance's whole lifetime while any request is in flight, active CPU only while code runs. A month includes 360 GB-hours of memory, 4 hours of active CPU and 1,000,000 invocations. Whether one Hobby instance serves several requests at once is not documented. Over its limits a Hobby project is paused and answers `503` until the next period.
- **Neon Free.** 100 compute-unit hours a month, which is 400 hours at the smallest size of 0.25 CU. Compute suspends 5 minutes after the last query, and Free cannot change that. When the hours run out, connections fail until the next month; data stays.
- `LISTEN/NOTIFY` does not work through Neon's pooled address, which the application uses (ADR 0005 item 5).

What one viewer costs on Vercel Hobby, from these facts, per hour a page is visible:

| Transport | Invocations | Provisioned memory | Hours of viewing the free tier allows |
|---|---|---|---|
| Version check every 15 s | 240 | 240 × 2 GB × the check's duration; at 50 ms about 0.007 GB-hours | about 4,000, limited by invocations |
| Stream of 60 s that checks every 2 s | 60 | up to 2 GB-hours, if each stream holds its own instance | about 180, limited by memory |

The duration of a check is an estimate until the instance measures it. Neon limits both transports the same way: any check more often than every 5 minutes keeps the database awake, so what counts is how long anyone at all is viewing, up to 400 hours a month. The maintenance pass every six hours (ADR 0005 item 4) wakes it for about 10 of those hours.

## Decision

1. **Two transports, one setting.** The instance setting `LIVE_UPDATES` chooses how pages learn of a change. The page gets the transport and its timings from the server when it renders, so changing the setting needs no new build.
   - `push`, the default: pages hold a Server-Sent Events stream. The server listens with PostgreSQL `LISTEN` on one connection per instance and sends a version to a stream only when a notification for its event arrives. It runs no query while nothing changes.
   - `poll`: pages ask for the version every `LIVE_POLL_SECONDS` (default 15), as in Phase 2.
2. **The database notifies.** A trigger on `events` sends `NOTIFY` with the event id and the new version whenever the version changes, and when the event is deleted. No server function has to remember it, and the notification leaves only when the change commits. Sending works through a transaction pooler; only listening needs a direct connection.
3. **The stream is a web route.** It lives in the web application, not under `/api/v1`, so the API's contract does not depend on an instance setting. API clients check for changes with `ETag` and `304` (Phase 3 rule A10).
4. **Bounded streams.** The server closes a stream after `LIVE_STREAM_SECONDS` (default 300), and the browser reconnects after 1 second. While nothing changes it sends a comment line every 15 seconds, so proxies keep the connection open.
5. **Idle viewers stop.** A visible page that has had no input for `LIVE_IDLE_MINUTES` (default 30) stops its stream or checks, says that updates are paused, and checks at once on the next input or focus. A hidden page stops as before. This bounds what a forgotten tab costs with either transport.
6. **Falling back.** A page whose stream fails twice in a row falls back to `poll` and tries the stream again after 5 minutes. When the server's listening connection fails, it closes every stream, so pages fall back the same way until it reconnects.
7. **Listening address.** `push` listens through `DATABASE_LISTEN_URL`, which defaults to `DATABASE_URL`. Containers need no extra setting; an instance behind a transaction pooler sets the direct address.
8. **The Vercel instance uses `poll`.** Its project sets `LIVE_UPDATES=poll`, `LIVE_POLL_SECONDS=15` and `LIVE_IDLE_MINUTES=10`. That keeps invocations near a tenth of the free tier for 400 hours of viewing, and the idle limit lets Neon suspend 15 minutes after a viewer stops. A stream on Vercel Hobby would hit the memory limit before Neon's hours, as the table shows, so `push` waits for a host with a long-lived process.

## Consequences

- Containers get changes in about a second and spend no database queries on idle viewers. The Vercel instance keeps the Phase 2 delay of up to 15 seconds.
- Both transports need tests: the end-to-end tests run each against the production build.
- `push` holds one database connection per instance outside the pool of ADR 0005 item 5.
- The trigger is added by a migration that only adds, so the previous release keeps working (ADR 0005 item 3).
- Neon's 400 hours are the real limit on the Vercel instance, whatever the transport. The operator compares the measured invocation duration and the Neon hours with this ADR after the first month and adjusts the settings, not the code.
