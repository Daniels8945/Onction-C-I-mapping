import express from "express";
import cors from "cors";
import "dotenv/config";
import { pool } from "./db.js";
import {
  loadGraph, shortestPaths, buildPath, nodeSequenceToHops,
  nearestInjectionSubstation, lossPct, energyProjection,
} from "./grid.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

const q = (text, params) => pool.query(text, params).then((r) => r.rows);

app.get("/health", (_req, res) => res.json({ ok: true }));

// ── Raw network + parties ────────────────────────────────────────────────
app.get("/api/substations", async (_req, res, next) => {
  try { res.json(await q("SELECT name, voltage_kv, lat::float AS lat, lon::float AS lon, is_injection FROM substation ORDER BY name")); }
  catch (e) { next(e); }
});

app.get("/api/grid-edges", async (_req, res, next) => {
  try { res.json(await q("SELECT from_node, to_node, km::float AS km FROM grid_edge ORDER BY from_node")); }
  catch (e) { next(e); }
});

app.get("/api/gencos", async (_req, res, next) => {
  try { res.json(await q("SELECT name, lat::float AS lat, lon::float AS lon, connection_node, capacity_note, commitment, tariff_ngn_kwh::float AS tariff_ngn_kwh FROM genco ORDER BY name")); }
  catch (e) { next(e); }
});

app.get("/api/discos", async (_req, res, next) => {
  try { res.json(await q("SELECT name, lat::float AS lat, lon::float AS lon, injection_node, contracted, upstream_source, last_mile_km::float AS last_mile_km FROM disco ORDER BY name")); }
  catch (e) { next(e); }
});

app.get("/api/offtakers", async (_req, res, next) => {
  try { res.json(await q("SELECT name, capacity_mw::float AS capacity_mw, lat::float AS lat, lon::float AS lon, location, injection_node, last_mile_km::float AS last_mile_km FROM offtaker ORDER BY name")); }
  catch (e) { next(e); }
});

app.get("/api/loss-models", async (_req, res, next) => {
  try { res.json(await q("SELECT code, label, fixed_pct::float AS fixed_pct, per_100km_pct::float AS per_100km_pct, is_default FROM loss_model ORDER BY per_100km_pct")); }
  catch (e) { next(e); }
});

app.get("/api/atcc-scenarios", async (_req, res, next) => {
  try { res.json(await q("SELECT code, label, atcc_pct::float AS atcc_pct, basis FROM atcc_scenario ORDER BY atcc_pct")); }
  catch (e) { next(e); }
});

// Precomputed 182-route lookup (fast path — the same numbers as v_route_lookup)
app.get("/api/routes", async (_req, res, next) => {
  try {
    res.json(await q(`
      SELECT r.genco, r.dest_name, r.dest_kind, r.injection_node,
             r.routed_km::float AS routed_km, r.last_mile_km::float AS last_mile_km,
             (r.routed_km + r.last_mile_km)::float AS total_km, r.hop_count
      FROM route r ORDER BY r.genco, r.dest_name
    `));
  } catch (e) { next(e); }
});

// ── Dynamic routing: works for any destination, not just the 182 precomputed pairs ──
async function resolveDestination({ dest, lat, lng, graph }) {
  if (dest) {
    const [off] = await q("SELECT name, injection_node, last_mile_km::float AS last_mile_km, capacity_mw::float AS capacity_mw FROM offtaker WHERE name = $1", [dest]);
    if (off) return { label: off.name, kind: "offtaker", injectionNode: off.injection_node, lastMileKm: off.last_mile_km, destMw: off.capacity_mw };
    const [disco] = await q("SELECT name, injection_node, last_mile_km::float AS last_mile_km FROM disco WHERE name = $1", [dest]);
    if (disco) return { label: disco.name, kind: "disco", injectionNode: disco.injection_node, lastMileKm: disco.last_mile_km, destMw: null };
    return null;
  }
  if (lat != null && lng != null) {
    const nearest = nearestInjectionSubstation(graph, Number(lat), Number(lng));
    if (!nearest) return null;
    return { label: `(${lat}, ${lng})`, kind: "point", injectionNode: nearest.node, lastMileKm: nearest.lastMileKm, destMw: null };
  }
  return null;
}

async function computeRouteFor({ gencoName, destination, lossModelCode, atccCode, destMwOverride, graph }) {
  const [genco] = await q(
    "SELECT name, connection_node, commitment, tariff_ngn_kwh::float AS tariff_ngn_kwh, capacity_note FROM genco WHERE name = $1",
    [gencoName]
  );
  if (!genco) return { error: `Unknown GenCo: ${gencoName}` };

  const dest = destination;
  if (!dest) return { error: "Could not resolve destination" };

  const { dist, prev } = shortestPaths(graph, genco.connection_node);
  const routedKm = dist.get(dest.injectionNode);
  if (routedKm === undefined || routedKm === Infinity) {
    return { error: `No path from ${genco.connection_node} to ${dest.injectionNode}` };
  }
  const seq = buildPath(prev, genco.connection_node, dest.injectionNode);
  const hops = nodeSequenceToHops(graph, seq);

  const [lossModel] = await q(
    "SELECT code, label, fixed_pct::float AS fixed_pct, per_100km_pct::float AS per_100km_pct FROM loss_model WHERE code = $1",
    [lossModelCode || "base"]
  );
  const loss_pct = lossPct(routedKm, lossModel);
  const lastMileKm = dest.lastMileKm ?? 0;
  const totalKm = routedKm + lastMileKm;

  let atcc = null, projection = null;
  const destMw = destMwOverride ?? dest.destMw;
  if (atccCode) {
    [atcc] = await q("SELECT code, label, atcc_pct::float AS atcc_pct, basis FROM atcc_scenario WHERE code = $1", [atccCode]);
  }
  if (destMw) {
    projection = energyProjection({ destMw, lossPctValue: loss_pct, atccPct: atcc?.atcc_pct ?? null });
  }

  return {
    genco: genco.name,
    commitment: genco.commitment,
    tariff_ngn_kwh: genco.tariff_ngn_kwh,
    destination: dest.label,
    dest_kind: dest.kind,
    injection_node: dest.injectionNode,
    routed_km: Math.round(routedKm * 10) / 10,
    last_mile_km: lastMileKm,
    total_km: Math.round(totalKm * 10) / 10,
    hop_count: hops.length,
    hops,
    loss_model: lossModel,
    loss_pct: Math.round(loss_pct * 100) / 100,
    dest_mw: destMw ?? null,
    atcc_scenario: atcc,
    projection,
  };
}

// GET /api/route?genco=NDPHC%20Geregu&dest=GeePee&lossModel=base&scenario=dedicated
// GET /api/route?genco=NDPHC%20Geregu&lat=6.68&lng=3.235&mw=6&lossModel=base
app.get("/api/route", async (req, res, next) => {
  try {
    const { genco, dest, lat, lng, lossModel, scenario, mw } = req.query;
    if (!genco) return res.status(400).json({ error: "genco is required" });
    const graph = await loadGraph();
    const destination = await resolveDestination({ dest, lat, lng, graph });
    if (!destination) return res.status(400).json({ error: "Provide dest=<offtaker/disco name> or lat & lng" });
    const result = await computeRouteFor({
      gencoName: genco, destination, lossModelCode: lossModel, atccCode: scenario,
      destMwOverride: mw ? Number(mw) : undefined, graph,
    });
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (e) { next(e); }
});

// GET /api/best-source?dest=GeePee   OR   ?lat=&lng=&mw=
// Ranks every GenCo by total routed distance to the destination — the dynamic
// equivalent of v_best_source, but works for any point, not just known offtakers.
app.get("/api/best-source", async (req, res, next) => {
  try {
    const { dest, lat, lng, lossModel, scenario, mw } = req.query;
    if (!dest && (lat == null || lng == null)) {
      return res.status(400).json({ error: "Provide dest=<offtaker/disco name> or lat & lng" });
    }
    const graph = await loadGraph();
    const destination = await resolveDestination({ dest, lat, lng, graph });
    if (!destination) return res.status(404).json({ error: "Destination not found" });

    const gencos = await q("SELECT name FROM genco ORDER BY name");
    const results = [];
    for (const g of gencos) {
      const r = await computeRouteFor({
        gencoName: g.name, destination, lossModelCode: lossModel, atccCode: scenario,
        destMwOverride: mw ? Number(mw) : undefined, graph,
      });
      if (!r.error) results.push(r);
    }
    results.sort((a, b) => a.total_km - b.total_km);
    res.json({ destination: destination.label, results });
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal error", detail: err.message });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`onction-grid-api listening on :${port}`));
