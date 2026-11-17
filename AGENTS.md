# convenr

convenr is a free group scheduling web app that works without an account. This file holds the rules for coding agents that work in this repository.

## Read first

- [`docs/roadmap.md`](docs/roadmap.md): phases, principles and decisions.
- [`docs/spec/phase-1.md`](docs/spec/phase-1.md): numbered rules for the current phase. Cite a rule by its number.
- [`docs/adr/`](docs/adr/): technology stack, time representation, identifiers and secrets.
- [`DESIGN.md`](DESIGN.md): the only source of colors, type, radii and sizes.
- [`apps/web/AGENTS.md`](apps/web/AGENTS.md): read the bundled Next.js docs before writing Next.js code.

## Commands

Run every command through mise from the repository root.

| Task                                            | Command                               |
| ----------------------------------------------- | ------------------------------------- |
| Install dependencies                            | `mise run install`                    |
| Format                                          | `mise run format`                     |
| Lint                                            | `mise run lint`                       |
| Type check                                      | `mise run typecheck`                  |
| Unit and database tests (starts PostgreSQL)     | `mise run test`                       |
| Regenerate the theme after a `DESIGN.md` change | `mise run theme`                      |
| Everything CI checks except end-to-end tests    | `mise run check`                      |
| End-to-end tests (needs a build)                | `mise run e2e`                        |
| Development server                              | `mise run db:up`, then `mise run dev` |
| Application and database in containers          | `mise run up`, `mise run down`        |

A change is done when `mise run check` and `mise run e2e` exit with code 0.

## Rules

1. **Packages.** Use `nub`, never `npm`, `pnpm` or `bun`, to add or remove packages. Pin exact versions. Do not bypass the minimum release age. Keep `pnpm-workspace.yaml` and `pnpm-lock.yaml` valid for plain pnpm.
2. **Runtime.** Node.js is the supported runtime. Do not use Bun-only or platform-specific APIs.
3. **Colors and type.** Never write a literal color, font or radius in a component. Add or change a token in `DESIGN.md` and run `mise run theme`. Do not edit `apps/web/src/app/tokens.css`.
4. **Components.** Add shadcn components with the shadcn CLI into `apps/web/src/components/ui`. Do not hand-edit them beyond what a rule in `DESIGN.md` requires.
5. **Text.** Every string a visitor sees lives in `apps/web/messages/cs.json` and `en.json`. Both files have the same keys.
6. **Time.** Follow ADR 0002. Use `Temporal`, never `Date` arithmetic.
7. **Secrets and privacy.** Follow ADR 0003. Never log headers, URL fragments, tokens, passwords or visitor addresses. Add no third-party analytics, fonts or scripts loaded from another host.
8. **Database.** Drizzle is a typed SQL query builder here. Write queries explicitly. Migrations are SQL files made by `mise run db:generate`. The server applies pending migrations when it starts. Database tests are named `*.db.test.ts`.
9. **Private folders.** Folders listed in `.git/info/exclude` are local only. Never stage them, name them or link to them in a committed file.
10. **Git.** Until the operator says otherwise, work happens in local stacked branches: no pushes, pull requests or issues. Each branch is one reviewable step on top of the previous one, and each commit passes `mise run check`. Rewrite a branch's history before handing it over so that it holds no fix-up or work-in-progress commits. Commits carry the operator's identity and no co-author trailers.
11. **Editing files.** Change source files with an editor tool, not with scripts that rewrite them by string replacement.

## Agent skills

Project skills live in [`.agents/skills/`](.agents/skills/README.md). Install and update them with the `skills` CLI as described there.

When two sources disagree, the earlier one in this list wins: the operator's request, this file, `DESIGN.md`, `impeccable`, the `antislop` skills.

- `impeccable` leads interface design work: direction, layout, type, color and copy.
- `antislop`, `antislop-ui`, `antislop-human`, `antislop-layoutmobile` and `antislop-copywriting` are a checklist. Apply them while building and run their Delivery Gate before reporting interface work done. Their mode for this project is `during`; do not ask for it.
- `antislop-code` governs code comments.
- `install-anti-slop` installs and updates the anti-slop Oxlint rules in `tools/oxlint/anti-slop/`. `mise run lint` enforces them. Fix a finding; do not disable a rule.

### Issue tracker

Issues and specs live as GitHub issues in `espoem/convenr`, handled with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root when it exists, and `docs/adr/`. See `docs/agents/domain.md`.

### Verify commands

- Formatter: `mise run format`
- Linter: `mise run lint`
- Type check: `mise run typecheck`
- Test: `mise run test`
