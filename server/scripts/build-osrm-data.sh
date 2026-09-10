#!/usr/bin/env bash
# One-time (re-run whenever osrm-data/nigeria-latest.osm.pbf is updated):
# preprocesses the OSM extract into the .osrm files osrm-routed serves.
# Needs ~2-4GB RAM free and a few minutes. Run from the repo root, or anywhere
# — it cd's to the repo root itself.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ ! -f osrm-data/nigeria-latest.osm.pbf ]; then
  echo "osrm-data/nigeria-latest.osm.pbf not found — download it first:"
  echo "  mkdir -p osrm-data && curl -L -o osrm-data/nigeria-latest.osm.pbf https://download.geofabrik.de/africa/nigeria-latest.osm.pbf"
  exit 1
fi

docker run --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/nigeria-latest.osm.pbf
docker run --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend osrm-partition /data/nigeria-latest.osrm
docker run --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend osrm-customize /data/nigeria-latest.osrm

echo "OSRM data ready in osrm-data/ — (re)start the osrm container to pick it up:"
echo "  docker compose up -d osrm"
