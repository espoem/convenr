# convenr

Find a time that works for a whole group. Free, without ads or trackers, and usable without an account by the organizer and by everyone who responds.

convenr is in early development. The application so far is a start page in Czech and English. The plan is in the [roadmap](docs/roadmap.md), the rules of the first release are in the [Phase 1 specification](docs/spec/phase-1.md), and the technology decisions are in the [ADRs](docs/adr/).

## Requirements

- [mise](https://mise.jdx.dev/), which installs the pinned Node.js and nub.
- Docker or Podman with compose, for the database and for running the container image.

## Run it locally

```sh
git clone git@github.com:espoem/convenr.git
cd convenr
mise install
mise run install
```

`mise run install` also installs a pre-commit hook that formats and lints the staged files.

Run everything in containers:

```sh
mise run up      # builds the image, starts the application and PostgreSQL
mise run down    # stops them; the database volume is kept
```

The application is then at <http://localhost:3000>. `GET /api/health` reports whether it reaches the database.

Or run the development server against a database in a container:

```sh
cp .env.example .env
mise run db:up
mise run dev
```

The database listens on `127.0.0.1:5432` (`DB_PORT` changes the host port) with user, password and database `convenr`, which is fine on your own machine only. The server applies pending migrations when it starts; `mise run db:migrate` applies them without starting it.

Or run the production build with Node.js, the same server the end-to-end tests use:

```sh
mise run build
DATABASE_URL='postgres://convenr:convenr@127.0.0.1:5432/convenr' PORT=3000 node apps/web/scripts/start-standalone.mts
```

`scripts/compose.sh` uses Podman when it is installed and Docker otherwise. Set `CONTAINER_ENGINE=docker` or `CONTAINER_ENGINE=podman` to choose. With Podman on macOS or Windows, run `podman machine start` first.

The `purge`, `usage` and `db:migrate` tasks read `DATABASE_URL` and `RETENTION_DAYS` from `.env` or from the environment. The development and production servers read only the environment of the shell that starts them.

## Check a change

```sh
mise run check   # format, lint, theme, type check, unit tests, build
mise run e2e     # end-to-end tests against the production build
```

The end-to-end tests need the test browser once: run `nubx playwright install chromium` in `apps/web`.

## Deploy

An instance is one container image and one PostgreSQL database.

1. Build the image from the repository root: `docker build -f Containerfile -t convenr .` (or `podman build`).
2. Provide a PostgreSQL 18 database.
3. Run the image with these settings:

   | Variable         | Required | Meaning                                                                                                                         |
   | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`   | yes      | `postgres://user:password@host:5432/database`                                                                                   |
   | `PORT`           | no       | Port to listen on. Default `3000`.                                                                                              |
   | `HOSTNAME`       | no       | Address to bind. Default `0.0.0.0`.                                                                                             |
   | `RETENTION_DAYS` | no       | Days after an event's last date (or last change, for days of the week) until it is deleted. Default `90`; `never` keeps events. |

4. Put a reverse proxy that terminates TLS in front of it, and point a health check at `/api/health`.

The server deletes expired events every hour. To delete them from outside, for example from a scheduler, run `node apps/web/scripts/purge.mts` in the image with the same settings, or `mise run purge` in a checkout.

The server keeps daily usage counts without names, contents or identifiers. `node apps/web/scripts/usage.mts` in the image (or `mise run usage`) prints them for the last 30 days; add a first and a last day, such as `2027-03-01 2027-03-31`, for another range.

On Vercel, where no server process lasts, the server neither migrates nor purges. CI applies migrations with `node apps/web/scripts/migrate.mts` before it deploys, and the scheduled `Maintenance` workflow runs the purge every six hours ([ADR 0005](docs/adr/0005-vercel-deployment.md)).

The image contains a plain Node.js server and uses no platform-specific API, so any host that runs containers works. `compose.yaml` is a working example of the whole setup. Change `POSTGRES_PASSWORD` before using it anywhere but your own machine.

## Repository layout

```text
apps/web/      Next.js application
docs/          roadmap, specifications, ADRs
.agents/       project skills for coding agents
AGENTS.md      project rules for coding agents
DESIGN.md      design tokens and component rules
compose.yaml   application and PostgreSQL
.mise.toml     tool versions and tasks
```

## License

[AGPL-3.0-only](LICENSE). The skill installed in `.agents/skills/impeccable` is under Apache-2.0.
