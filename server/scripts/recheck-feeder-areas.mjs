// One-off: apply the stricter "area" rule to stored matches (the station's
// name must be in the place's own name). Failing rows become "none" — no new
// lookups are made. node scripts/recheck-feeder-areas.mjs
import { pool } from "../src/db.js";
import { cleanStation, tokens } from "../src/feeders/locate.js";
const { rows } = await pool.query("SELECT station, state, matched_name FROM feeder_station_location WHERE method = 'google' AND precision = 'area'");
let dropped = 0;
for (const r of rows) {
  const want = tokens(cleanStation(r.station).name);
  if (want.some(t => tokens(r.matched_name).includes(t))) continue;
  await pool.query("UPDATE feeder_station_location SET method = 'none', lat = NULL, lon = NULL, precision = NULL, looked_up_at = now() WHERE station = $1 AND state = $2", [r.station, r.state]);
  console.log("dropped:", r.station, "|", r.state, "→ was", r.matched_name);
  dropped++;
}
console.log(`${dropped} of ${rows.length} area matches dropped`);
await pool.end();
