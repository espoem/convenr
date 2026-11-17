# ADR 0001: Technology stack

Status: accepted, 2026-11-16.

## Context

convenr is a free, open-source group scheduling web app. One developer builds it. It must run locally with one command, deploy to any host that runs containers, and later offer a public REST API with SDKs in TypeScript and Python.

## Decision

### One server-side application

The whole product is one Next.js application using the App Router. It owns the database and every domain rule. The public REST API (Phase F3) is served by route handlers in that application.

### One data access layer, several entry points

Added 2026-11-17, following the data security guide bundled with Next.js 16.

Every read and write goes through a data access layer in `apps/web/src/server`. It validates input with Zod, checks the caller's secret, runs the query and returns only the fields the caller may see. No other code imports the database client.

- **Pages** read through it in Server Components.
- **The application's own forms** write through Server Actions that call it. A form then works without JavaScript, Next.js checks the `Origin` header against the host, and one response carries both the result and the updated page. Two limits follow. Actions from one browser run one after another. A new deployment changes the action ids, so a page that was open across a deployment reloads when an action is not found.
- **The public REST API** in F3 is a set of route handlers over the same layer, for clients without the UI.
- **An MCP server** for AI agents is possible later as another entry point over the same layer. It is not planned in a phase yet.

An entry point never holds a domain rule, so all of them behave the same.

### Stack

| Area | Choice | Version pinned in F0 |
|---|---|---|
| Framework | Next.js, App Router | 16.4.6 |
| UI library | React | 19.3.0 |
| Language | TypeScript, `strict` and `noUncheckedIndexedAccess` on | 7.0.2 |
| Components | shadcn components on Base UI, copied into the repository | CLI 4.23.0 |
| Styling | Tailwind CSS, theme generated from `DESIGN.md` tokens | 4.3.3 |
| Database | PostgreSQL in every environment | 18.7 |
| Data access | Drizzle, used as a typed SQL query builder and for migrations | drizzle-orm 0.45.4, drizzle-kit 0.31.11, driver pg 8.23.1 |
| Validation and API contract | Zod schemas, shared by forms, server code and the API description | 4.6.7 |
| Internationalization | next-intl, Czech and English, language prefix in the address | 4.15.1 |
| Lint | oxlint | 1.93.0 |
| Format | oxfmt | 0.78.0 |
| Unit tests | Vitest | 5.1.0 |
| End-to-end tests | Playwright | 1.65.1 |
| Runtime | Node.js LTS | 26.13.1 |
| Node toolkit | nub for installing, running scripts and running files | 0.11.1 |
| Tool versions | mise, pinned in `.mise.toml` | not applicable |
| Containers | One application image and a compose file that works with Docker and Podman | not applicable |
| CI | GitHub Actions | not applicable |

"Latest stable" is the rule for every row, with one limit: the package tool is configured to refuse a release younger than 24 hours, so a pinned version is the newest one older than that. This is why oxlint, oxfmt, Tailwind CSS and React are one patch behind the versions that were current on 2026-11-16.

TypeScript 7.0.2 was confirmed in F0: the type check and the production build of Next.js 16.4.6 with next-intl pass under it.

### Rules that follow from the choices

1. **Drizzle is a query builder here.** Queries are written explicitly. The relational query API and implicit lazy loading are not used. Migrations are SQL files in the repository. The server applies pending ones when it starts, under an advisory lock so that servers starting together apply them once.
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
compose.yaml        application and PostgreSQL; the scheduler service arrives in F2
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
- The shadcn CLI starts `pnpm` by name. With nub as the package tool, a `pnpm` command that forwards to nub must be on the path while the CLI runs.
- Fonts are self-hosted variable fonts (Bricolage Grotesque and Atkinson Hyperlegible Next, both under the SIL Open Font License), so no visitor request goes to a font host.
