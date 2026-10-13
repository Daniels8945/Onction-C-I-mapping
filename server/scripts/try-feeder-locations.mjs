// Dry run of the feeder-station locator on a random sample: prints what each
// station would be matched to, stores nothing. node scripts/try-feeder-locations.mjs [n]
import { pool } from "../src/db.js";
import { loadGraph } from "../src/grid.js";
import { cleanStation, matchNetwork, matchGoogle, stateOf } from "../src/feeders/locate.js";

const n = Number(process.argv[2]) || 25;
const graph = await loadGraph();
const subs = [...graph.nodes.values()];
const { rows } = await pool.query("SELECT station, state FROM (SELECT DISTINCT station, state FROM feeder) s ORDER BY random() LIMIT $1", [n]);
for (const { station, state: raw } of rows) {
  const state = stateOf(raw), clean = cleanStation(station);
  const net = state && matchNetwork(clean, state, subs);
  const g = !net && state ? await matchGoogle(clean, state).catch(e => ({ error: e.message })) : null;
  console.log([station, raw, "→", net ? `NETWORK ${net.name}` : g?.error ? `ERROR ${g.error}` : g ? `GOOGLE/${g.precision} ${g.name} | ${g.address}` : "NOT FOUND"].join("  "));
}
await pool.end();
