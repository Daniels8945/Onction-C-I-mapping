-- Substation coordinates verified on Google satellite imagery and approved
-- on the coordinate review page, 2026-10-25 (batch 1 of the 38 least precise).
-- server/init/ only runs on a brand-new database; apply this once to existing ones:
--   docker exec -i mapping-db psql -U mapping -d mapping_grid < server/migrations/2026-10-25-verified-substations-batch1.sql
-- Safe to run more than once. Feeder stations matched to these substations read
-- their position from here, so nothing else needs updating.
BEGIN;

UPDATE substation SET lat = 5.070228, lon = 8.339814 WHERE name = 'Adiabo Trx';
UPDATE substation SET lat = 4.850026, lon = 7.254421 WHERE name = 'Afam';
UPDATE substation SET lat = 6.494999, lon = 3.346646 WHERE name = 'Akangba';
UPDATE substation SET lat = 7.626848, lon = 8.569685 WHERE name = 'Apir/Makurdi';
UPDATE substation SET lat = 7.372086, lon = 3.856389 WHERE name = 'Ayede (Ibadan)';
UPDATE substation SET lat = 11.980399, lon = 8.522677 WHERE name = 'Dan Agundi 132kV';
UPDATE substation SET lat = 8.409583, lon = 4.603567 WHERE name = 'Ganmo (Ilorin)';
UPDATE substation SET lat = 6.407643, lon = 5.684229 WHERE name = 'Ihovbor';
UPDATE substation SET lat = 6.603138, lon = 3.247592 WHERE name = 'Ikeja West';
UPDATE substation SET lat = 7.822632, lon = 6.630490 WHERE name = 'Lokoja';
UPDATE substation SET lat = 6.456216, lon = 7.537962 WHERE name = 'New Haven';
UPDATE substation SET lat = 11.740477, lon = 13.082276 WHERE name = 'New Maiduguri';
UPDATE substation SET lat = 6.618090, lon = 3.335525 WHERE name = 'Ogba 132kV';
UPDATE substation SET lat = 6.654628, lon = 3.206559 WHERE name = 'Ota 132kV';
UPDATE substation SET lat = 6.863585, lon = 3.653314 WHERE name = 'Sagamu 132kV';
UPDATE substation SET lat = 5.925230, lon = 5.643834 WHERE name = 'Sapele';
UPDATE substation SET lat = 6.402840, lon = 7.558181 WHERE name = 'Ugwuaji';

COMMIT;
