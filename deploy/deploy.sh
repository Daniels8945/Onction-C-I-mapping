#!/usr/bin/env bash
# Run as the app's dedicated user (see bootstrap.sh), from the repo root.
# Builds and (re)starts the db/api/web containers. Safe to re-run for
# redeploys after a `git pull`.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env found — generating one with a fresh DB password."
  cat > .env <<EOF
MAPPING_DB_PASSWORD=$(openssl rand -hex 24)
MAPPING_CORS_ORIGIN=*
MAPPING_API_PORT=4001
MAPPING_WEB_PORT=4080
# Leave as 127.0.0.1 if Nginx for onctionenergy.com runs on THIS box.
# If it's on a different server, set this to this VPS's public IP so
# that server can reach these containers — see deploy/DEPLOY.md's
# "cross-server" section for the firewall rule that has to go with it.
MAPPING_BIND_ADDR=127.0.0.1
EOF
  echo "Wrote .env — edit MAPPING_CORS_ORIGIN to https://onctionenergy.com/ once it's live."
fi

docker compose build
docker compose up -d

echo -n "Waiting for the API to come up"
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$(grep MAPPING_API_PORT .env | cut -d= -f2)/health" >/dev/null 2>&1; then
    echo " — up."
    docker compose ps
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo
echo "API didn't come up in time — check logs:"
echo "  docker compose logs api"
exit 1
