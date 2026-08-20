#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"

command -v docker >/dev/null 2>&1 || { echo "Docker is not installed."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is not available."; exit 1; }
test -f deployment/.env || { echo "Create deployment/.env from deployment/.env.example first."; exit 1; }
chmod 600 deployment/.env

DATABASE_PASSWORD=$(sed -n 's/^POSTGRES_PASSWORD=//p' deployment/.env | tail -n 1)
if [ -z "$DATABASE_PASSWORD" ] || [ "$DATABASE_PASSWORD" = "replace-with-a-long-random-value" ] || [ "${#DATABASE_PASSWORD}" -lt 20 ]; then
  echo "POSTGRES_PASSWORD must be a unique value of at least 20 characters."
  exit 1
fi

ALLOWED_ORIGINS=$(sed -n 's/^AEGIS_ALLOWED_ORIGINS=//p' deployment/.env | tail -n 1)
PUBLIC_URL=$(sed -n 's/^AEGIS_PUBLIC_URL=//p' deployment/.env | tail -n 1)
case "$ALLOWED_ORIGINS" in
  ""|*example.org*) echo "Set AEGIS_ALLOWED_ORIGINS to the exact demo origin."; exit 1 ;;
esac
case "$PUBLIC_URL" in
  http://*|https://*) ;;
  *) echo "AEGIS_PUBLIC_URL must be an http:// or https:// URL."; exit 1 ;;
esac

if grep -q '^AEGIS_TLS_ENABLED=true$' deployment/.env; then
  case "$PUBLIC_URL" in
    https://*) ;;
    *) echo "AEGIS_PUBLIC_URL must use https:// when TLS is enabled."; exit 1 ;;
  esac
  test -s deployment/certs/fullchain.pem || { echo "TLS certificate deployment/certs/fullchain.pem is missing."; exit 1; }
  test -s deployment/certs/privkey.pem || { echo "TLS key deployment/certs/privkey.pem is missing."; exit 1; }
  docker compose --env-file deployment/.env -f docker-compose.yml -f docker-compose.tls.yml config --quiet
else
  docker compose --env-file deployment/.env config --quiet
fi

echo "Deployment preflight passed."
