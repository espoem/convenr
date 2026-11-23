# ADR 0010: The maintenance pass runs in the application

Status: accepted, 2026-11-23. It replaces item 4 of [ADR 0005](0005-vercel-deployment.md); the rest of ADR 0005 holds.

## Context

Under ADR 0005 a GitHub workflow runs `apps/web/scripts/purge.mts` against the production database every six hours. That script needs only Node and `pg`, which suits the purge and the usage counts: both are SQL.

Phase 5 adds work to the maintenance pass that is not SQL alone. It sends what waits in the email outbox, retries failed emails, and sends reminders and digests that are due. Sending needs the mail server, `AUTH_SECRET` for the unsubscribe links, the message catalogs and the email layout. Run from the workflow, that would put the SMTP password and `AUTH_SECRET` into GitHub. The recipients' addresses and the emails' content would also pass through GitHub's runners. Notifications also need a shorter interval than six hours: a digest waits at most an hour after the interval of NT2.

## Decision

1. **The application runs the pass.** `maintain` in `apps/web/src/server/maintain.ts` is the pass as the server runs it. The server's hourly timer calls it in a container, and the route `POST /api/maintenance` calls it on request.
2. **A secret guards the route.** The route exists only when `MAINTENANCE_SECRET` is set, at least 32 characters. Every other instance answers `not_found`. The caller sends the secret as `Authorization: Bearer`, compared in constant time. A missing or wrong secret gets `unauthorized`. The answer holds only two counts: deleted events and sent emails.
3. **The workflow only calls the route.** `maintenance.yml` posts to `PRODUCTION_URL` every hour and on demand. It holds `MAINTENANCE_SECRET` and nothing else: no database address and no mail settings. It passes the header on standard input, so the secret is not in the runner's process list.
4. **The command stays.** `purge.mts` keeps running the SQL part of the pass for an operator who schedules it from outside. It sends no email; the server's timer does that.

## Consequences

- GitHub no longer processes data of visitors. It sees one request an hour and its count.
- The pass runs every hour on Vercel instead of every six hours. Each run wakes the database. Under the Neon compute budget of ADR 0006, the hourly pass alone keeps it awake about two hours a day instead of about 20 minutes.
- An instance on Vercel needs `MAINTENANCE_SECRET` in the Vercel project and as a GitHub secret of the environment `production`. Changing the secret means changing both. Until both are set, the workflow fails and nothing is maintained.
- A function on Vercel stops after its maximum duration. The route allows 60 seconds, so one run sends a bounded number of emails, and the next run sends the rest.
- Rollback: point the workflow back at `purge.mts` with `DATABASE_URL_UNPOOLED`. Expired events are then purged again, but waiting emails stay in the outbox until the route runs.
