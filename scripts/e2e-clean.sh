#!/usr/bin/env bash
# Clear stale local e2e listeners before Playwright launches fresh servers from the latest build.
set -euo pipefail

port="${E2E_PORT:-3100}"
for offset in 0 1 2 3; do
	p=$((port + offset))
	pids="$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
	if [ -n "$pids" ]; then
		echo "e2e-clean: stopping stale listener(s) on port $p ($pids)" >&2
		kill $pids 2>/dev/null || true
		sleep 0.3
		remaining="$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
		if [ -n "$remaining" ]; then
			kill -9 $remaining 2>/dev/null || true
		fi
	fi
done

exec nub run --filter @convenr/web e2e "$@"
