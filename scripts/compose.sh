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

# `podman compose` delegates to an external provider. Use the docker-compose that
# .mise.toml pins, so Podman and Docker run the same implementation.
if [ "$engine" = podman ] && [ -z "${PODMAN_COMPOSE_PROVIDER:-}" ]; then
  PODMAN_COMPOSE_PROVIDER="$(command -v docker-compose || true)"
  export PODMAN_COMPOSE_PROVIDER PODMAN_COMPOSE_WARNING_LOGS=false
fi

cd "$(dirname "$0")/.."
exec "$engine" compose "$@"
