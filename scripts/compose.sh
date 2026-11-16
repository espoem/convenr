#!/bin/sh
# Runs compose with Podman when it is installed, otherwise with Docker.
# Set CONTAINER_ENGINE=docker or CONTAINER_ENGINE=podman to choose explicitly.
set -eu

engine="${CONTAINER_ENGINE:-}"
if [ -z "$engine" ]; then
  if command -v podman >/dev/null 2>&1; then
    engine=podman
  elif command -v docker >/dev/null 2>&1; then
    engine=docker
  else
    echo "Neither podman nor docker is installed." >&2
    exit 1
  fi
fi

cd "$(dirname "$0")/.."
exec "$engine" compose "$@"
