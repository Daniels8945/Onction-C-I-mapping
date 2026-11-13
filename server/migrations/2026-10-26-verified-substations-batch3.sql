-- Substation coordinates verified on Google satellite imagery (positions found
-- with Google Places and OpenStreetMap outlines), 2026-10-26: batch 3, the
-- remaining built substations. server/init/ only runs on a brand-new database;
-- apply this once to existing ones:
--   docker exec -i mapping-db psql -U mapping -d mapping_grid < server/migrations/2026-10-26-verified-substations-batch3.sql
-- Safe to run more than once.
BEGIN;

UPDATE substation SET lat = 6.504718, lon = 3.084077 WHERE name = 'Agbara 132kV';
UPDATE substation SET lat = 7.471999, lon = 6.654886 WHERE name = 'Ajaokuta';
UPDATE substation SET lat = 6.609741, lon = 3.351362 WHERE name = 'Alausa 132kV';
UPDATE substation SET lat = 10.285276, lon = 9.849617 WHERE name = 'Bauchi';
UPDATE substation SET lat = 6.295818, lon = 5.634327 WHERE name = 'Benin';
UPDATE substation SET lat = 10.319824, lon = 11.479328 WHERE name = 'Dadin Kowa';
UPDATE substation SET lat = 7.470096, lon = 6.657976 WHERE name = 'Geregu';
UPDATE substation SET lat = 10.319494, lon = 11.138283 WHERE name = 'Gombe';
UPDATE substation SET lat = 6.836256, lon = 3.919147 WHERE name = 'Ijebu Ode 132kV';
UPDATE substation SET lat = 6.468570, lon = 3.379540 WHERE name = 'Ijora 132kV';
UPDATE substation SET lat = 5.153202, lon = 7.680684 WHERE name = 'Ikot Ekpene';
UPDATE substation SET lat = 9.167714, lon = 4.821275 WHERE name = 'Jebba';
UPDATE substation SET lat = 9.856540, lon = 4.608747 WHERE name = 'Kainji';
UPDATE substation SET lat = 9.114812, lon = 7.476343 WHERE name = 'Katampe';
UPDATE substation SET lat = 11.928182, lon = 8.475312 WHERE name = 'Kumbotso (Kano)';
UPDATE substation SET lat = 11.856558, lon = 13.139867 WHERE name = 'Maiduguri 132kV';
UPDATE substation SET lat = 9.987507, lon = 8.846114 WHERE name = 'Makeri (Jos)';
UPDATE substation SET lat = 5.711147, lon = 6.575489 WHERE name = 'Okpai';
UPDATE substation SET lat = 6.116821, lon = 6.802503 WHERE name = 'Onitsha';
UPDATE substation SET lat = 7.800905, lon = 4.577733 WHERE name = 'Osogbo';
UPDATE substation SET lat = 9.972529, lon = 6.830475 WHERE name = 'Shiroro';
UPDATE substation SET lat = 11.873515, lon = 8.456874 WHERE name = 'Tamburawa 132kV';
UPDATE substation SET lat = 4.832033, lon = 7.034888 WHERE name = 'PH Main';
UPDATE substation SET lat = 6.435221, lon = 3.503534 WHERE name = 'Lekki 132kV';
UPDATE substation SET lat = 6.678877, lon = 3.524593 WHERE name = 'Odogunyan 132kV';
UPDATE substation SET lat = 6.550300, lon = 3.388890 WHERE name = 'Oworonshoki 132kV';

-- DisCo delivery points that sit at their substation (last mile 0 km) move with it.
UPDATE disco SET lat = 9.987507, lon = 8.846114 WHERE name = 'JED (Jos)';
UPDATE disco SET lat = 6.295818, lon = 5.634327 WHERE name = 'BEDC';
UPDATE disco SET lat = 4.832033, lon = 7.034888 WHERE name = 'PHEDC';

COMMIT;
