#!/usr/bin/env bash
# Clear stale local e2e listeners before Playwright launches fresh servers from the latest build.
set -euo pipefail

port="${E2E_PORT:-3100}"
for offset in 0 1 2 3; do
	p=$((port + offset))
	pids="$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
	if [ -n "$pids" ]; then
		echo "e2e-clean: stopping stale listener(s) on port $p ($pids)" >&2
		while IFS= read -r pid; do
			[ -n "$pid" ] && kill "$pid" 2>/dev/null || true
		done <<EOF
$pids
EOF
		sleep 0.3
		remaining="$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
		if [ -n "$remaining" ]; then
			while IFS= read -r pid; do
				[ -n "$pid" ] && kill -9 "$pid" 2>/dev/null || true
			done <<EOF
$remaining
EOF
		fi
	fi
done

node apps/web/scripts/prepare-e2e-db.mts
exec nub run --filter @convenr/web e2e "$@"
