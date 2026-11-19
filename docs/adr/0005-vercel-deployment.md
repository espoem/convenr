# ADR 0005: Deployment on Vercel

Status: accepted, 2026-11-19. It changes rule 1 of [ADR 0001](0001-technology-stack.md) for instances on Vercel; container instances keep it, and everything else in ADR 0001 holds.

## Context

The first real instance runs on Vercel with a Neon PostgreSQL database, so that the service can be seen working before the public launch. Vercel runs the application as short-lived functions: an instance starts on demand, may serve several requests, and stops when traffic stops. Next.js calls `register` in `instrumentation.ts` once per instance, so on Vercel that is every cold start. Two things the server does in `register` do not fit that model: it applies pending migrations before it serves, and it starts an hourly timer for the maintenance pass, which stops with the instance.

Vercel's Git integration builds and deploys every push, including one whose CI run fails. The operator wants every change pushed to `main` to reach production, but only after CI passes.

## Decision

1. **The server does nothing at start on Vercel.** When `VERCEL` is `1`, which Vercel sets on its deployments at build and run time, `register` installs the safe console and returns. It applies no migrations and starts no timer. Containers are unchanged.
2. **CI deploys.** A push to `main` whose CI jobs all pass runs two more jobs in the GitHub environment `production`. The first applies pending migrations with `apps/web/scripts/migrate.mts`, the server's own migrator under its advisory lock, over Neon's direct (unpooled) address. The second builds with the Vercel CLI on the runner and deploys the prebuilt output to production, then checks `/api/health`. Vercel's own Git deployments are turned off in `apps/web/vercel.json`.
3. **Migrations run before the code that needs them.** Between the two jobs, and after a rollback, the previous code runs against the new schema. A migration therefore adds before it removes: new columns are nullable or have a default, and a column or table is dropped only in a release after the code stopped using it.
4. **A schedule runs the maintenance pass.** The workflow `maintenance.yml` runs `apps/web/scripts/purge.mts` against the production database every six hours and on demand. The pass is idempotent and counts whole days, so a later run loses nothing.
5. **One pool setting everywhere.** The application connects through Neon's pooled address (PgBouncer in transaction mode). The pool keeps at most 10 connections per instance, gives up on a new connection after 10 seconds and closes one that is idle for 5 seconds, in containers too.
6. **Not indexed before the launch.** The instance answers under its `*.vercel.app` address with `X-Robots-Tag: noindex`, set in `apps/web/vercel.json`. convenr.party stays unconnected until the items of roadmap section 6 are done.

## Consequences

- The purge runs every six hours on Vercel instead of every hour, so an expired event may stay in the database up to six hours after it expires. It is unreachable from the moment it expires.
- The CI runner that deploys holds a Vercel token, and the Vercel CLI is published without npm provenance from a private repository. The token can read the project's environment, including the pooled database address. The job that migrates holds the direct database address and no Vercel token.
- GitHub disables a scheduled workflow after 60 days without activity in a public repository. A quiet repository then stops the purge until the workflow is turned on again.
- Data of visitors is processed by Vercel, Neon and, for the maintenance pass only, GitHub. The privacy policy names them before the launch.
