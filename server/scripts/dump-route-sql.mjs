// Regenerates the "INSERT INTO route ..." / "INSERT INTO route_hop ..." blocks
// in onction_grid_1.sql (and its server/init copy) from whatever's currently in
// the DB — run this after regenerate-routes.mjs so the seed files match reality.
import { pool } from "../src/db.js";
import fs from "node:fs";

function sqlStr(s) { return `'${String(s).replace(/'/g, "''")}'`; }

async function main() {
  const { rows: routes } = await pool.query(
    `SELECT genco, dest_name, dest_kind, injection_node, routed_km::float AS routed_km,
            last_mile_km::float AS last_mile_km, hop_count
     FROM route ORDER BY route_id`
  );
  const routeLines = routes.map((r, i) =>
    `  (${sqlStr(r.genco)}, ${sqlStr(r.dest_name)}, ${sqlStr(r.dest_kind)}, ${sqlStr(r.injection_node)}, ${r.routed_km}, ${r.last_mile_km}, ${r.hop_count})${i === routes.length - 1 ? ";" : ","}`
  );
  const routeSql = `INSERT INTO route (genco, dest_name, dest_kind, injection_node, routed_km, last_mile_km, hop_count) VALUES\n${routeLines.join("\n")}\n`;

  const { rows: hops } = await pool.query(
    `SELECT route_id, seq, from_node, to_node, km::float AS km FROM route_hop ORDER BY route_id, seq`
  );
  const hopLines = hops.map((h, i) =>
    `  (${h.route_id}, ${h.seq}, ${sqlStr(h.from_node)}, ${sqlStr(h.to_node)}, ${h.km})${i === hops.length - 1 ? ";" : ","}`
  );
  const hopSql = `INSERT INTO route_hop (route_id, seq, from_node, to_node, km) VALUES\n${hopLines.join("\n")}\n`;

  fs.writeFileSync("route-block.sql", routeSql);
  fs.writeFileSync("route-hop-block.sql", hopSql);
  console.log(`Wrote route-block.sql (${routes.length} rows) and route-hop-block.sql (${hops.length} rows)`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
