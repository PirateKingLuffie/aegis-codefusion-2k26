#!/usr/bin/env sh
set -eu

if [ "${1:-}" != "--confirm" ] || [ -z "${2:-}" ]; then
  echo "Usage: $0 --confirm deployment/backups/aegis-TIMESTAMP.dump"
  echo "This replaces the deployed AEGIS PostgreSQL database."
  exit 2
fi

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
BACKUP_DIR="$ROOT_DIR/deployment/backups"
DUMP_FILE=$(realpath "$2")

compose() {
  if grep -q '^AEGIS_TLS_ENABLED=true$' "$ROOT_DIR/deployment/.env"; then
    docker compose --env-file "$ROOT_DIR/deployment/.env" -f "$ROOT_DIR/docker-compose.yml" -f "$ROOT_DIR/docker-compose.tls.yml" "$@"
  else
    docker compose --env-file "$ROOT_DIR/deployment/.env" -f "$ROOT_DIR/docker-compose.yml" "$@"
  fi
}

case "$DUMP_FILE" in
  "$BACKUP_DIR"/aegis-*.dump) ;;
  *) echo "Restore file must be an AEGIS dump inside $BACKUP_DIR"; exit 2 ;;
esac

test -f "$DUMP_FILE"
test -f "$DUMP_FILE.sha256"
(cd "$BACKUP_DIR" && sha256sum -c "$(basename "$DUMP_FILE").sha256")

cd "$ROOT_DIR"
sh deployment/scripts/preflight.sh
if ! sh deployment/scripts/backup.sh; then
  echo "Warning: the pre-restore safety backup failed; continuing with the verified requested dump."
fi
compose stop proxy web api
compose exec -T db sh -c \
  'dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
compose exec -T db sh -c \
  'pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$DUMP_FILE"
compose up -d api web proxy
PUBLIC_URL=$(sed -n 's/^AEGIS_PUBLIC_URL=//p' deployment/.env | tail -n 1)
sh deployment/scripts/healthcheck.sh "${PUBLIC_URL:-http://127.0.0.1}"

echo "Database restored and health-checked from $DUMP_FILE."
