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

test -f deployment/.previous-release || { echo "No previous release recorded"; exit 1; }
PREVIOUS=$(cat deployment/.previous-release)
git cat-file -e "$PREVIOUS^{commit}"
CURRENT=$(git rev-parse HEAD)
ROLLBACK_DIR="$ROOT_DIR/deployment/rollback-worktree"
test ! -e "$ROLLBACK_DIR" || { echo "$ROLLBACK_DIR already exists; remove it safely before retrying."; exit 1; }
git worktree add --detach "$ROLLBACK_DIR" "$PREVIOUS"
cleanup() {
  cd "$ROOT_DIR"
  git worktree remove --force "$ROLLBACK_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cp deployment/.env "$ROLLBACK_DIR/deployment/.env"
if [ -d deployment/certs ]; then
  cp -R deployment/certs "$ROLLBACK_DIR/deployment/certs"
fi
cd "$ROLLBACK_DIR"
compose build
compose up -d --remove-orphans
PUBLIC_URL=$(sed -n 's/^AEGIS_PUBLIC_URL=//p' deployment/.env | tail -n 1)
sh "$ROOT_DIR/deployment/scripts/healthcheck.sh" "${PUBLIC_URL:-http://127.0.0.1}"
compose ps
echo "Rolled back containers from $CURRENT to $PREVIOUS without mutating the primary checkout."
