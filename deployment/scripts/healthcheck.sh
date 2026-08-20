#!/usr/bin/env sh
set -eu

BASE_URL=${1:-http://127.0.0.1}
ATTEMPT=0
until curl --fail --silent --show-error "$BASE_URL/api/health" >/dev/null 2>&1 && \
  curl --fail --silent --show-error "$BASE_URL/operations-api/health" >/dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge 30 ]; then
    echo "AEGIS did not become healthy at $BASE_URL within 60 seconds."
    exit 1
  fi
  sleep 2
done
echo "AEGIS web and operations API are healthy at $BASE_URL"
