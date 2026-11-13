-- Corrected substation coordinates, checked against Google satellite imagery
-- and Google Places (see server/scripts/ and e2e/coordinates.spec.js).
-- server/init/ only runs on a brand-new database, so existing databases
-- (including production) need this applied once:
--   docker exec -i mapping-db psql -U mapping -d mapping_grid < server/migrations/2026-10-24-verified-substations.sql
-- Safe to run more than once.
BEGIN;

UPDATE substation SET lat = 6.470704, lon = 3.571345 WHERE name = 'Aja/Ajah';   -- had been ~1.5 km off
UPDATE substation SET lat = 6.462202, lon = 3.421640 WHERE name = 'Alagbon';    -- had been ~2.5 km off

-- Feeder stations matched to these substations read their position from
-- here (feeder_station.matched_name), so nothing else needs updating.

COMMIT;
