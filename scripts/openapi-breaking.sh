#!/bin/sh
# Fails when apps/web/openapi.json changes in a way that breaks a client written for the
# document at the base revision. The base is `main` unless OPENAPI_BASE names another revision.
# A response that gains a field, a problem code or an enum value does not break a client, so
# only checks of level ERR fail, and oasdiff-levels.txt lowers the enum checks below it. A new
# variant of a union, such as a new schedule mode, is a documented limit of the generated SDKs,
# so it is lowered too. oasdiff-err-ignore.txt lists single changes accepted on purpose: a
# poll has no first day of the week, and a client written before polls cannot read one anyway.
set -eu

base="${OPENAPI_BASE:-main}"
document=apps/web/openapi.json

if ! git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
  echo "The base revision $base is not in this clone; fetch it first." >&2
  exit 1
fi

if ! git cat-file -e "$base:$document" 2>/dev/null; then
  echo "$base has no $document yet, so nothing can break."
  exit 0
fi

oasdiff breaking --fail-on ERR --severity-levels oasdiff-levels.txt \
  --err-ignore oasdiff-err-ignore.txt "$base:$document" "$document"
