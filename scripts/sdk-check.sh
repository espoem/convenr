#!/bin/sh
# Fails when `mise run sdk` changed, added or removed a file of a committed SDK, so a change of
# apps/web/openapi.json cannot land without the SDKs generated from it. It compares with the
# index, which is the commit in CI and lets a local run pass once the result is staged.
set -eu

cd "$(dirname "$0")/.."
generated="packages/sdk-ts/src/generated packages/sdk-python/src/convenr"

# shellcheck disable=SC2086
untracked="$(git ls-files --others --exclude-standard -- $generated)"

# shellcheck disable=SC2086
if ! git diff --quiet -- $generated || [ -n "$untracked" ]; then
  echo "The generated SDKs are out of date; run \`mise run sdk\` and commit the result:" >&2
  # shellcheck disable=SC2086
  git --no-pager diff --stat -- $generated >&2
  [ -z "$untracked" ] || echo "$untracked" >&2
  exit 1
fi
