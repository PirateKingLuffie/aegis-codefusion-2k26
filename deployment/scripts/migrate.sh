#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"

sh deployment/scripts/preflight.sh
docker compose --env-file deployment/.env up -d db cache

ATTEMPT=0
until docker compose --env-file deployment/.env exec -T db sh -c \
  'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge 30 ]; then
    echo "PostgreSQL did not become ready in time."
    exit 1
  fi
  sleep 2
done

docker compose --env-file deployment/.env exec -T db sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < deployment/postgres/init.sql

echo "PostGIS extensions, constraints and indexes are ready."
