#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"

compose() {
  if grep -q '^AEGIS_TLS_ENABLED=true$' deployment/.env; then
    docker compose --env-file deployment/.env -f docker-compose.yml -f docker-compose.tls.yml "$@"
  else
    docker compose --env-file deployment/.env "$@"
  fi
}

sh deployment/scripts/preflight.sh

if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo "Refusing to update a deployment checkout with uncommitted changes."
  exit 1
fi

if compose ps --status running --services | grep -qx db; then
  sh deployment/scripts/backup.sh
fi

PREVIOUS=$(git rev-parse HEAD)
printf '%s\n' "$PREVIOUS" > deployment/.previous-release
git pull --ff-only
compose build --pull
sh deployment/scripts/migrate.sh
compose up -d --remove-orphans
PUBLIC_URL=$(sed -n 's/^AEGIS_PUBLIC_URL=//p' deployment/.env | tail -n 1)
sh deployment/scripts/healthcheck.sh "${PUBLIC_URL:-http://127.0.0.1}"
compose ps
