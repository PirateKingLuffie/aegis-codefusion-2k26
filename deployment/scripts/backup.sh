#!/usr/bin/env sh
set -eu
umask 077

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
BACKUP_DIR="$ROOT_DIR/deployment/backups"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="$BACKUP_DIR/aegis-$STAMP.dump"
TEMP_TARGET="$TARGET.partial"
mkdir -p "$BACKUP_DIR"
trap 'rm -f "$TEMP_TARGET"' EXIT

cd "$ROOT_DIR"
docker compose --env-file deployment/.env exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$TEMP_TARGET"
test -s "$TEMP_TARGET"
mv "$TEMP_TARGET" "$TARGET"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$TARGET")" > "$(basename "$TARGET").sha256")
find "$BACKUP_DIR" -type f -name 'aegis-*.dump' -mtime +14 -delete
find "$BACKUP_DIR" -type f -name 'aegis-*.dump.sha256' -mtime +14 -delete
echo "Backup written and checksummed at $TARGET"
