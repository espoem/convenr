# Web Vitals and lint guard specification

Status: proposed 2026-11-26. This document defines the cross-phase Web Vitals benchmark and deterministic lint guard requirements of the [roadmap](../roadmap.md). The architectural decisions are in [ADR 0013](../adr/0013-web-vitals-and-lint-guards.md).

The spec is written as testable rules. Each rule has an id so that the spec can map it to code and tests; code and tests do not cite the ids.

## 1. Scope

This specification covers:

- the runtime Web Vitals benchmark runner (`mise run vitals`) against the standalone production build;
- the non-blocking CI workflow (`.github/workflows/vitals.yml`);
- baseline-driven fixes needed to reach top scores, including `/robots.txt`, polyfill delivery within the supported browser list and self-hosted font fallbacks;
- deterministic static guards in `mise run check`: built-in `oxlint` rules, community Stylelint rules, minimal custom `tools/oxlint/convenr/` rules with Vitest fixtures, and `.next/` per-page bundle byte budgets (`mise run vitals:static`).

This specification does not include:

- real-user monitoring beacons or client performance telemetry (ruled out by roadmap Principle 2);
- blocking pull requests, merges or deployments on shared-runner timing metrics;
- removing ADR 0011's cross-zone dated-grid layout update;
- loading fonts, stylesheets or scripts from another host.

## 2. Runtime benchmark rules

**WV1. Strict top scores.** Every covered public page in WV2 must meet every median threshold below on both desktop and throttled phone profiles, without trading clean standard idioms or dependencies for single-point runner variance.

| Metric or score | Desktop | Phone |
|---|---|---|
| Lighthouse Performance | `>= 98` | `>= 98` |
| Lighthouse Accessibility | `100` | `100` |
| Lighthouse Best Practices | `100` | `100` |
| Lighthouse SEO (indexable pages) | `100` | `100` |
| Cumulative Layout Shift (CLS) | `0` | `0` |
| Largest Contentful Paint (LCP) | `<= 1200 ms` | `<= 1800 ms` |
| Scripted Interaction to Next Paint (INP) | `<= 100 ms` | `<= 200 ms` |

Event pages under `/e/[segment]` set `noindex, nofollow` per ADR 0003 and exclude the Lighthouse `is-crawlable` audit while keeping `100` on every other SEO check.

**WV2. Covered public pages and states.** The benchmark audits the `en` locale across these public pages and seeded states.

| Page | Route | Indexable | Condition |
|---|---|---|---|
| Start page | `/en` | Yes | Default create form |
| Dated grid event (anonymous) | `/en/e/[segment]` | No | Seeded slots and participants, viewer zone matching reference zone |
| Dated grid event (joined) | `/en/e/[segment]` | No | Seeded browser cookie so the participant starts joined, matching reference zone |
| Weekday grid event | `/en/e/[segment]` | No | Seeded weekday slots and participants |
| Poll event | `/en/e/[segment]` | No | Multiple poll options and responses |
| API reference | `/en/api` | Yes | Generated reference page |
| Privacy | `/en/privacy` | Yes | Operator and contact settings active |
| Sign-in | `/en/sign-in` | No | Accounts enabled in the benchmark server (`noindex, nofollow`) |

Problem detail addresses under `/[locale]/problems/[code]` redirect to `/[locale]/api#problem-[code]` and are covered through the API reference page.

**WV3. Scripted INP interactions.** Because passive navigation cannot trigger Interaction to Next Paint, the benchmark drives real interactions on phone and desktop after load: switching event kind and picking dates on the start page, drag-painting cells on the availability grid, switching between the `Me` and `Group` tabs, and changing the best-window filter. The worst interaction latency across these scripted flows must stay within WV1's INP limit.

**WV4. Measurement protocol and speed.** The benchmark starts the standalone production server (`apps/web/scripts/start-standalone.mts`) backed by seeded PostgreSQL data and runs pinned `lighthouse` against Playwright's Chromium binary. Each page and profile runs one warmup pass followed by three measured passes and evaluates the median. Pages run in parallel so a full run completes in roughly 60 to 90 seconds. Setting `VITALS_PAGE` filters the run to matching pages for fast local iteration.

**WV5. Crawlability and `robots.txt`.** `apps/web/src/app/robots.ts` serves `/robots.txt` allowing public indexable pages and disallowing `/api/` and `/e/`. Event pages under `/e/[segment]` keep `robots: { index: false, follow: false }` per ADR 0003.

**WV6. Cross-zone dated-grid exception.** Dated event loads where the viewer's time zone matches the event's reference zone must hold `CLS = 0`. When the viewer's time zone differs from the reference zone, ADR 0011's post-hydration grid update stays a documented exception outside WV1's `CLS = 0` check.

## 3. Deterministic guard rules

**WG1. Built-in `oxlint` rules.** `.oxlintrc.json` enables Oxlint's built-in Rust rules for Next.js (`nextjs/*`), accessibility (`jsx-a11y/*`), performance (`perf` set to `error`), barrel exports (`oxc/no-barrel-file`), and restricted client imports (`eslint/no-restricted-imports` requiring `zod/mini` in client-reachable paths instead of full `zod`), failing `mise run lint` on any warning. `react-perf/*` is omitted because without `React.memo` it rejects normal Server Component props, native `style` props, and `<Suspense fallback>`.

**WG2. Community CSS linting.** `stylelint` and `stylelint-high-performance-animation` run inside `mise run lint` on application stylesheets (`apps/web/src/**/*.css`, excluding generated `tokens.css`) to reject transitions or animations on layout-triggering properties, missing or blocking `font-display` in `@font-face` rules, missing generic font fallbacks, and external `http://` or `https://` `url()` assets. (`stylelint-plugin-font` was evaluated and dropped after failing `nub`'s weekly-download trust check.)

**WG3. Minimal custom `oxlint` rules.** Custom rules in `tools/oxlint/convenr/` cover only proven Web Vitals or asset regression paths that no built-in Oxlint rule or community plugin handles, starting with `convenr/no-external-assets` to ban third-party `http://` and `https://` URLs in asset `src` or stylesheet, font and script `href` attributes. Every custom rule has Vitest tests with valid and invalid code fixtures.

**WG4. Deterministic bundle budgets.** `mise run vitals:static` runs inside `mise run check` after `mise run build`, reads `.next/` build manifests and chunk files, and fails when any covered page exceeds its committed gzipped initial JS or CSS byte budget. Budgets are set immediately after the optimized baseline meets WV1.

**WG5. Non-blocking CI benchmark workflow.** `.github/workflows/vitals.yml` runs `mise run vitals` against the production build on `workflow_dispatch` and on a weekly schedule on `main`. It never blocks pull requests, merges or deployments, and uploads the JSON and HTML benchmark reports as workflow artifacts.

## 4. Optimization constraints

Baseline-driven changes needed to meet WV1 are in scope, including trimming eager `core-js` delivery within `AGENTS.md` Rule 12's browser support policy, tuning self-hosted font fallbacks or `next/font/local` for the fonts named in `DESIGN.md`, and cutting unnecessary client hydration work.

Every optimization must keep existing invariants intact: per-request CSP nonces and zero third-party hosts (ADR 0003), no-JS dated grids (ADR 0011), steady stateful controls (`apps/web/e2e/steady.spec.ts`), and `DESIGN.md` colors, typography and spacing.

## 5. Acceptance test

The Web Vitals criterion is complete when on a clean clone:

1. `mise run check` exits with code 0, covering `mise run lint` (`oxlint` and Stylelint), custom rule Vitest fixtures, and `mise run vitals:static` bundle budgets.
2. `mise run vitals` exits with code 0 against the standalone production server, with every page in WV2 meeting every WV1 threshold on phone and desktop, including WV3 scripted INP flows.
3. `mise run e2e` and `mise run sdk:acceptance` exit with code 0, proving no functional or layout-steadiness regressions.

## 6. Rule coverage

The tests and lint rules name no rule numbers. This section maps WV1 to WV6 and WG1 to WG5 to their implementation files and tests.

| Rule | Implementation and tests |
|---|---|
| `WV1` | Threshold evaluation and reporting in `apps/web/scripts/vitals.mts`; font loading and metric fallbacks in `apps/web/src/app/fonts.css` and `apps/web/src/app/globals.css`; batched grid measurement in `apps/web/src/components/event/availability-grid.tsx`; scoped client translations in `apps/web/src/components/client-messages.tsx`; client-filtered polyfills in `apps/web/scripts/generate-polyfills.ts` |
| `WV2` | Seeded public pages and states in `apps/web/scripts/vitals.mts` (`start`, `dated-grid`, `dated-grid-joined`, `weekday-grid`, `poll`, `api`, `privacy`, `sign-in`); `icon.svg` and `favicon.ico` in `apps/web/src/app/` |
| `WV3` | Scripted phone and desktop INP Event Timing flows (`start` and `dated-grid-joined`) in `apps/web/scripts/vitals.mts` |
| `WV4` | Isolated worker runs (1 warmup + 3 measured median), HTML/JSON output, and `VITALS_PAGE` filter in `apps/web/scripts/vitals.mts`; `mise run vitals` task in `.mise.toml` |
| `WV5` | `apps/web/src/app/robots.ts`; `noindex, nofollow` metadata on event pages (`apps/web/src/app/[locale]/e/`) and `sign-in` (`apps/web/src/app/[locale]/sign-in/page.tsx`) |
| `WV6` | Reference-zone fast path in `apps/web/src/components/event/board-view.ts` and matching-zone benchmark coverage in `apps/web/scripts/vitals.mts` (ADR 0011 cross-zone client update preserved) |
| `WG1` | Built-in `nextjs/*`, `jsx-a11y/*`, `perf`, `oxc/no-barrel-file`, and client `eslint/no-restricted-imports` rules in `.oxlintrc.json` |
| `WG2` | Stylelint configuration in `stylelint.config.mjs` using `stylelint-high-performance-animation` and built-in font/URL rules, executed by `lint` in `package.json` (`mise run lint`) |
| `WG3` | Custom Oxlint rule `convenr/no-external-assets` in `tools/oxlint/convenr/no-external-assets.ts`, registered in `tools/oxlint/convenr/index.ts`, and tested in `apps/web/src/no-external-assets.test.ts` |
| `WG4` | Bundle byte-budget checker in `apps/web/scripts/vitals-static.mts` and `mise run vitals:static` wired into `mise run check` in `.mise.toml` |
| `WG5` | Scheduled and manually dispatched workflow in `.github/workflows/vitals.yml`, linted by `mise run workflows:lint` |
