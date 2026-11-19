# convenr

convenr is a free group scheduling web app that works without an account. This file holds the rules for coding agents that work in this repository.

## Read first

- [`docs/roadmap.md`](docs/roadmap.md): phases, principles and decisions.
- [`docs/spec/phase-2.md`](docs/spec/phase-2.md): numbered rules for the current phase, on top of [`docs/spec/phase-1.md`](docs/spec/phase-1.md). Cite a rule by its number.
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
| Lint the GitHub workflows                       | `mise run workflows:lint`             |
| Unit and database tests (starts PostgreSQL)     | `mise run test`                       |
| Regenerate the theme after a `DESIGN.md` change | `mise run theme`                      |
| Rewrite the OpenAPI copy after an API change    | `mise run openapi`                    |
| Regenerate both SDKs after an OpenAPI change    | `mise run sdk`                        |
| SDK acceptance tests (needs a build)            | `mise run sdk:acceptance`             |
| Everything CI checks except end-to-end tests    | `mise run check`                      |
| End-to-end tests (needs a build)                | `mise run e2e`                        |
| Development server                              | `mise run db:up`, then `mise run dev` |
| Application and database in containers          | `mise run up`, `mise run down`        |

A change is done when `mise run check`, `mise run e2e` and `mise run sdk:acceptance` exit with code 0.

## Rules

1. **Packages.** Use `nub`, never `npm`, `pnpm` or `bun`, to add or remove packages. Pin exact versions. Do not bypass the minimum release age. Keep `pnpm-workspace.yaml` and `pnpm-lock.yaml` valid for plain pnpm.
2. **Runtime.** Node.js is the supported runtime. Do not use Bun-only or platform-specific APIs.
3. **Colors and type.** Never write a literal color, font or radius in a component. Add or change a token in `DESIGN.md` and run `mise run theme`. Do not edit `apps/web/src/app/tokens.css`.
4. **Components.** Add shadcn components with the shadcn CLI into `apps/web/src/components/ui`. Do not hand-edit them beyond what a rule in `DESIGN.md` requires.
5. **Text.** Every string a visitor sees lives in `apps/web/messages/cs.json` and `en.json`. Both files have the same keys.
6. **Time.** Follow ADR 0002. Use `Temporal`, never `Date` arithmetic.
7. **Secrets and privacy.** Follow ADR 0003. Never log headers, URL fragments, tokens, passwords or visitor addresses. Add no third-party analytics, fonts or scripts loaded from another host.
8. **Database.** Drizzle is a typed SQL query builder here. Write queries explicitly. Migrations are SQL files made by `mise run db:generate`. The server applies pending migrations when it starts, except on Vercel, where CI applies them before it deploys (ADR 0005). A migration must leave the previous release working. Database tests are named `*.db.test.ts`.
9. **Private folders.** Folders listed in `.git/info/exclude` are local only. Never stage them, name them or link to them in a committed file.
10. **Git.** Until the operator says otherwise, work happens in local stacked branches: no pull requests or issues, and the only branch pushed is `main`, fast-forwarded to finished branches. Each branch is one reviewable step on top of the previous one, and each commit passes `mise run check`. Rewrite a branch's history before handing it over so that it holds no fix-up or work-in-progress commits. Commits carry the operator's identity and no co-author trailers.
11. **Editing files.** Change source files with an editor tool, not with scripts that rewrite them by string replacement.
12. **Browser support.** Use Baseline Widely available features without a fallback. Use a Newly available feature only behind feature detection, with a fallback of at most 20 lines and no added dependency.
13. **Icons.** Use Phosphor icons (`@phosphor-icons/react`) where an icon is needed. Do not add another icon set.
14. **No doc numbers in code.** Code, comments, identifiers, problem codes and test titles do not name spec rules, phases or sections, or numbered rules of `DESIGN.md` and `AGENTS.md`. An ADR may be cited, because an accepted ADR does not change. A comment says why the code exists. The spec maps its rules to code and tests, and `docs/spec/problem-codes.md` maps rules to problem codes. `mise run lint` enforces this with `convenr/no-spec-references`.
15. **Design stance.** Design for forward compatibility. Keep backward compatibility only where a change would break a released public API. Model data so that impossible states cannot be written, and keep state explicit in a named field or a tagged union, not implied by nulls or by a combination of fields. A problem code is a snake_case name a reader understands without the docs.
16. **Steady layout.** A control that changes state keeps everything around it in place. `apps/web/e2e/steady.spec.ts` presses every control with `aria-pressed` or `role="tab"`, so mark a new control with one of them. When a press changes something elsewhere, such as an element that appears, check it with `expectSteady` from `apps/web/e2e/helpers.ts`.

## Agent skills

Project skills live in [`.agents/skills/`](.agents/skills/README.md). Install and update them with the `skills` CLI as described there.

When two sources disagree, the earlier one in this list wins: the operator's request, this file, `DESIGN.md`, `impeccable`, the `antislop` skills.

- `impeccable` leads interface design work: direction, layout, type, color and copy.
- `antislop`, `antislop-ui`, `antislop-human`, `antislop-layoutmobile` and `antislop-copywriting` are a checklist. Apply them while building and run their Delivery Gate before reporting interface work done. Their mode for this project is `during`; do not ask for it.
- `antislop-code` governs code comments.
- `modern-web-guidance` gives current HTML, CSS and browser API patterns. Search it before writing interface code; its `npx modern-web-guidance` command may be run as the skill describes. Rule 12 is the browser support policy it asks for.
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
