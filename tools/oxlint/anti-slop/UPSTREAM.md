# Vendored anti-slop Oxlint plugin

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `13909c9e07590f5a85d93c62712259fe14a883f7`, folder `src/`. Copied with the `install-anti-slop` skill's `scripts/install.mjs`, which leaves out the rule tests. MIT license.

Registered in `.oxlintrc.json` as the `anti-slop` JS plugin with every generic rule at `error`. The `effect/` plugin is copied but not registered, because convenr does not depend on Effect.

Local deviations: none. To update, follow `.agents/skills/install-anti-slop/references/update.md`.
