# ADR 0013: Web Vitals benchmarks and deterministic lint guards

Status: proposed, 2026-11-26.

## Context

Principle 7 of the [roadmap](../roadmap.md) requires every public page to hold a strict top score in Web Vitals benchmarks on phone and desktop, and requires deterministic lint rules to stop changes that lower that score.

The existing application places four real constraints on Web Vitals:

- Every page calls `connection()` in the root layout so Next.js can place a per-request Content Security Policy nonce on its scripts ([ADR 0003](0003-identifiers-and-secrets.md), item 9).
- Client startup eagerly loads 74 `core-js` modules from `apps/web/src/polyfills.generated.ts` to match the supported browser list in `apps/web/package.json`.
- `apps/web/src/app/globals.css` imports self-hosted `@fontsource-variable` fonts without metric-adjusted fallback font descriptors.
- [ADR 0011](0011-dated-grid-from-the-server.md) renders a dated grid in the event's reference zone on the server and accepts a second layout pass in the browser when the viewer's time zone differs from that reference zone.

Three measurement constraints also apply. First, navigation-only Lighthouse audits measure Total Blocking Time rather than Interaction to Next Paint (INP), because no visitor interacts during a passive page load. Second, shared GitHub Actions runners show CPU and I/O variance, so blocking pull requests or deploys on runtime LCP or INP timings causes flaky failures. Third, roadmap Principle 2 forbids third-party analytics and persistent visitor tracking, which rules out real-user monitoring beacons.

## Decision

1. **Two-layer verification.** Deterministic static and bundle checks run in `mise run check` on every pull request and push. Runtime Web Vitals benchmarks run locally on demand with `mise run vitals` and in a separate non-blocking workflow `.github/workflows/vitals.yml` triggered by `workflow_dispatch` and a weekly schedule on `main`.
2. **Lighthouse and scripted INP on one runner.** Pin `lighthouse` via `nub` as a devDependency of `apps/web`. One Node script drives both Lighthouse navigation audits and scripted user interactions, measuring INP through Lighthouse `timespan` or Chromium CDP Event Timing, against the standalone production server (`apps/web/scripts/start-standalone.mts`). The script reuses Playwright's installed Chromium binary so no second browser is downloaded.
3. **Strict top thresholds with variance guardrails.** Every covered public page must score `>= 98` in Lighthouse Performance and `100` in Accessibility and Best Practices on both phone and desktop, plus `100` in SEO on indexable pages. Event pages under `/e/[segment]` set `robots: { index: false, follow: false }` per ADR 0003 and exclude the `is-crawlable` audit, while `apps/web/src/app/robots.ts` serves `/robots.txt`. Core Web Vitals medians must meet `CLS = 0` on phone and desktop, `LCP <= 1200 ms` on desktop and `LCP <= 1800 ms` on throttled phone, and scripted `INP <= 100 ms` on desktop and `INP <= 200 ms` on throttled phone. Critical-path bottlenecks found in the baseline are fixed in code while keeping a 2-point Performance buffer above `97` and the `200 ms` mobile INP bound so headless-runner variance does not force awkward workarounds around standard libraries.
4. **Fast parallel benchmark protocol.** The benchmark tests one locale (`en`), runs one warmup pass followed by three measured runs per page and profile, and takes the median. Pages run in parallel so a full run finishes in roughly 60 to 90 seconds, and an environment filter lets a developer test one page during iteration.
5. **Keep ADR 0011's cross-zone exception.** Matching-zone loads on dated events enforce `CLS = 0`. Cross-zone dated events keep ADR 0011's documented client layout update so dated grids still render without JavaScript.
6. **Built-in and community linters before custom rules.** Prefer built-in `oxlint` Rust rules (`nextjs/*`, `jsx-a11y/*`, `perf` at `error`, `oxc/no-barrel-file`, and `eslint/no-restricted-imports` keeping full `zod` out of client bundles in favor of `zod/mini`) for JS, TS and JSX. (`react-perf/*` is left disabled because without `React.memo` it produces false positives on Server Component props and native `style` attributes.) Pin `stylelint` and `stylelint-high-performance-animation` via `nub` along with Stylelint's built-in font and `url()` rules (`stylelint-plugin-font` was rejected due to `nub`'s low-download trust check). Add custom rules in `tools/oxlint/convenr/` only for verified gaps with no maintained community plugin, starting with `convenr/no-external-assets`, and back every custom rule with valid and invalid Vitest fixtures.
7. **Deterministic build-artifact byte budgets in `mise run check`.** A task `mise run vitals:static` runs after `mise run build`, reads `.next/` manifests and chunks, and fails if any covered page exceeds its gzipped initial JS or CSS byte budget calibrated right above the optimized baseline.
8. **No real-user monitoring.** No client-side Web Vitals telemetry script or external performance beacon is added.

## Consequences

- Pull requests and pushes to `main` get fast, deterministic protection from `oxlint`, Stylelint and `.next/` byte budgets without timing noise from shared CI runners.
- Timing regressions that pass static checks are caught locally with `mise run vitals` and weekly in `.github/workflows/vitals.yml`.
- Keeping top Performance scores (`>= 98`) on throttled mobile uses standard `zod/mini` entrypoints where schemas run in the browser, trims eager polyfill delivery within `AGENTS.md` Rule 12, and adds metric-adjusted fallback font rules in `apps/web/src/app/globals.css`.
- Pinning `lighthouse`, `stylelint` and `stylelint-high-performance-animation` as devDependencies adds no bytes to the production client bundle.
- Rollback: remove `.github/workflows/vitals.yml`, the `vitals` and `vitals:static` tasks, the added devDependencies and the added `oxlint` rules. Application runtime behavior stays intact.
