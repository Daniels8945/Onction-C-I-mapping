// One-off: add the two newly-confirmed grid_edge corridors, then regenerate the
// precomputed route/route_hop tables (182 rows) to match — see onction_grid_1.sql
// section 6's own note: "Regenerate ... if the network changes."
import { pool } from "./src/db.js";
import { loadGraph, shortestPaths, buildPath, nodeSequenceToHops } from "./src/grid.js";

async function main() {
  await pool.query(`
    INSERT INTO grid_edge (from_node, to_node, km) VALUES
      ('Ijebu Ode 132kV', 'Sagamu 132kV', 29.92),
      ('Ikorodu 132kV', 'Sagamu 132kV', 35.0)
    ON CONFLICT DO NOTHING
  `);
  console.log("grid_edge: inserted the 2 new corridors (or already present)");

  const graph = await loadGraph();
  const { rows: gencos } = await pool.query("SELECT name, connection_node FROM genco ORDER BY name");
  const { rows: offtakers } = await pool.query("SELECT name, injection_node, last_mile_km::float AS last_mile_km FROM offtaker ORDER BY name");
  const { rows: discos } = await pool.query("SELECT name, injection_node, last_mile_km::float AS last_mile_km FROM disco ORDER BY name");
  const destinations = [
    ...offtakers.map(o => ({ ...o, kind: "offtaker" })),
    ...discos.map(d => ({ ...d, kind: "disco" })),
  ];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE route_hop, route RESTART IDENTITY");

    let routeCount = 0, hopCount = 0;
    for (const g of gencos) {
      const { dist, prev } = shortestPaths(graph, g.connection_node);
      for (const d of destinations) {
        const routedKm = dist.get(d.injection_node);
        if (routedKm === undefined || routedKm === Infinity) continue; // unreachable — skip, matches original behaviour
        const seq = buildPath(prev, g.connection_node, d.injection_node);
        const hops = nodeSequenceToHops(graph, seq);

        const { rows: [{ route_id }] } = await client.query(
          `INSERT INTO route (genco, dest_name, dest_kind, injection_node, routed_km, last_mile_km, hop_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING route_id`,
          [g.name, d.name, d.kind, d.injection_node, Math.round(routedKm * 10) / 10, d.last_mile_km, hops.length]
        );
        routeCount++;
        for (const h of hops) {
          await client.query(
            `INSERT INTO route_hop (route_id, seq, from_node, to_node, km) VALUES ($1, $2, $3, $4, $5)`,
            [route_id, h.seq, h.from_node, h.to_node, h.km]
          );
          hopCount++;
        }
      }
    }
    await client.query("COMMIT");
    console.log(`Regenerated ${routeCount} route rows, ${hopCount} route_hop rows.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Sanity check: the exact pair the fix was about.
  const check = await pool.query(
    `SELECT genco, dest_name, injection_node, routed_km, last_mile_km, hop_count
     FROM route WHERE genco = 'Tetracore (Atakobo)' AND dest_name = 'CDK Industries'`
  );
  console.log("Tetracore -> CDK Industries now:", check.rows[0]);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
