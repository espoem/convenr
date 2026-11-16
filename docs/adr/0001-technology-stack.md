# ADR 0001: Technology stack

Status: accepted, 2026-11-16.

## Context

convenr is a free, open-source group scheduling web app. One developer builds it. It must run locally with one command, deploy to any host that runs containers, and later offer a public REST API with SDKs in TypeScript and Python.

## Decision

### One server-side application

The whole product is one Next.js application using the App Router. It owns the database and every domain rule. Pages read and write through server code in the same application. The public REST API (Phase F3) is served by route handlers in that application.

### Stack

| Area | Choice | Version checked on 2026-11-16 |
|---|---|---|
| Framework | Next.js, App Router | 16.4.6 |
| UI library | React | 19.3.1 |
| Language | TypeScript, `strict` and `noUncheckedIndexedAccess` on | 7.0.2 |
| Components | shadcn components, copied into the repository | CLI 4.23.0 |
| Styling | Tailwind CSS, theme generated from `DESIGN.md` tokens | 4.3.5 |
| Database | PostgreSQL in every environment | pinned in the compose file in F0 |
| Data access | Drizzle, used as a typed SQL query builder and for migrations | drizzle-orm 0.45.4 |
| Validation and API contract | Zod schemas, shared by forms, server code and the API description | 4.6.7 |
| Internationalization | next-intl, Czech and English, language prefix in the address | 4.15.1 |
| Lint | oxlint | 1.94.0 |
| Format | oxfmt | 0.79.0 |
| Unit tests | Vitest | 5.1.0 |
| End-to-end tests | Playwright | 1.65.1 |
| Runtime | Node.js LTS | 26 |
| Node toolkit | nub for installing, running scripts and running files | 0.11 |
| Tool versions | mise, pinned in `.mise.toml` | not applicable |
| Containers | One application image and a compose file that works with Docker and Podman | not applicable |
| CI | GitHub Actions | not applicable |

"Latest stable" is the rule for every row. F0 pins the exact versions that are current when the skeleton is created.

### Rules that follow from the choices

1. **Drizzle is a query builder here.** Queries are written explicitly. The relational query API and implicit lazy loading are not used. Migrations are SQL files in the repository.
2. **The project layout stays compatible with pnpm.** The repository has a `pnpm-workspace.yaml` and a `pnpm-lock.yaml`, and nub runs in its pnpm compatibility mode. nub is younger than version 1.0, so the project must work with plain pnpm without changes.
3. **Node.js is the supported runtime. Bun is checked.** CI runs the unit tests and the production build under Bun as a second job. A failure there is a bug to fix, but Bun-only APIs are not used.
4. **No platform-specific APIs.** The application uses only what Node.js and PostgreSQL provide. This keeps a container host, AWS, Vercel and Cloudflare all possible. The hosting provider is not chosen yet.
5. **Scheduled work is a command.** Anything that must run on a schedule, such as deleting expired events in F2, is a command of the application. The compose file runs it from a scheduler service. A platform without long-running processes can call the same command from its own scheduler.
6. **One contract for the API.** In F3 the OpenAPI description is generated from the Zod schemas the application already validates with. Both SDKs are generated from that description, with a thin hand-written layer on top. CI fails when generated code is out of date. The generator libraries are chosen in F3, by two tests: they support OpenAPI 3.1, and their output type-checks under strict settings in both languages.

### Python

Python appears only in `packages/sdk-py`, from F3. It uses uv for dependencies, ruff for lint and format, a strict type checker and pytest. The Python version is the latest stable (3.15 on the decision date), pinned in `.mise.toml`.

### Repository layout

```text
apps/web/           Next.js application
packages/sdk-ts/    TypeScript SDK (F3)
packages/sdk-py/    Python SDK (F3)
docs/               roadmap, specifications, ADRs
.agents/            project skills for coding agents
AGENTS.md           project rules for coding agents
DESIGN.md           design tokens and component rules
compose.yaml        application, PostgreSQL, scheduler
.mise.toml          tool versions and tasks
```

### Design tokens

`DESIGN.md` is the only place where colors, type, spacing and radii are defined. The Tailwind theme and the shadcn variables are generated from it. The palette and the measured contrast ratios are:

| Token | Value | Use | Contrast |
|---|---|---|---|
| `action` | `#AB0F0F` | Primary buttons, brand | 6.94:1 on `background`. White text on it: 7.48:1 |
| `action-active` | `#B80909` | Hover and pressed state of `action` | White text on it: 6.82:1 |
| `ink` | `#4D3320` | Text, dark surfaces | 10.76:1 on `background` |
| `ink-muted` | `#816E5E` | Secondary text | 4.50:1 on `background` |
| `earth` | `#80592F` | Borders, cell outlines, secondary controls | 5.75:1 on `background` |
| `available` | `#ABA446` | Middle of the heat scale | 2.40:1 on `background`, so it is never used alone as an edge |
| `available-strong` | `#6A662B` | Top of the heat scale | 5.49:1 on `background`. White text on it: 5.92:1 |
| `background` | `#FAF6EE` | Page background | not applicable |

The heat scale has five steps: `#EEE6DB` (none), `#E6E2C4`, `#BCB66B`, `#898338`, `#6A662B`. The lightest steps have almost no contrast with the background, so every cell has a 1-pixel `earth` outline. The count is also available as text (spec rule V3), so the scale never carries information by color alone.

## Alternatives rejected

- **FastAPI as a second backend beside Next.js.** Two services over one database would hold the same rules in two languages, share ownership of the schema, and double the deployment. Python stays in the project as an SDK.
- **FastAPI as the only backend.** It would remove Drizzle and add a second container for every self-hosted instance.
- **SQLite for local runs.** Drizzle keeps separate schema definitions and migrations per database, so everything would exist twice and local tests would run against a different database than production.
- **pnpm or Bun as the package tool.** nub was chosen by the project owner. Rule 2 keeps pnpm as a fallback.

## Consequences

- One image and one database make up a full instance.
- The REST API is not a separate deployable. If it ever needs to be, the Zod contract and the generated SDKs stay valid.
- The project depends on a toolkit that has not reached version 1.0. The pnpm-compatible layout limits that risk.
- TypeScript 7 and the chosen libraries must be confirmed to work together when the skeleton is built. If a library does not yet support TypeScript 7, F0 pins the newest TypeScript version that all of them support and records it here.
