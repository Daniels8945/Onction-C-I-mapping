-- Substation coordinates verified on Google satellite imagery and approved
-- on the coordinate review page, 2026-10-25 (batch 2 of the 38 least precise).
-- server/init/ only runs on a brand-new database; apply this once to existing ones:
--   docker exec -i mapping-db psql -U mapping -d mapping_grid < server/migrations/2026-10-25-verified-substations-batch2.sql
-- Safe to run more than once.
BEGIN;

UPDATE substation SET lat = 5.056533, lon = 7.322044 WHERE name = 'Alaoji';
UPDATE substation SET lat = 5.540813, lon = 5.914185 WHERE name = 'Delta/Ughelli';
UPDATE substation SET lat = 6.565547, lon = 3.614588 WHERE name = 'Egbin';
UPDATE substation SET lat = 8.977366, lon = 7.072749 WHERE name = 'Gwagwalada';
UPDATE substation SET lat = 6.625082, lon = 3.506001 WHERE name = 'Ikorodu 132kV';
UPDATE substation SET lat = 7.654828, lon = 4.724906 WHERE name = 'Ilesa 132kV';
UPDATE substation SET lat = 10.591982, lon = 7.412295 WHERE name = 'Kaduna';
UPDATE substation SET lat = 6.735659, lon = 4.709079 WHERE name = 'Omotosho';
UPDATE substation SET lat = 10.499237, lon = 7.417080 WHERE name = 'Kaduna Town 132kV';
UPDATE substation SET lat = 6.572907, lon = 3.369423 WHERE name = 'Maryland 132kV';
UPDATE substation SET lat = 6.881895, lon = 3.313279 WHERE name = 'Papalanto 132kV';

COMMIT;
