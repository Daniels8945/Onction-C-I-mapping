import express from "express";
import cors from "cors";
import "dotenv/config";
import { pool } from "./db.js";
import {
  loadGraph, shortestPaths, buildPath, nodeSequenceToHops, pathKm,
  nearestInjectionSubstation, lossPct, energyProjection,
} from "./grid.js";
import { locate, inNigeria, normaliseStateName } from "./geo/admin.js";
import { searchPlaces, reversePlace, geocoderSources } from "./geo/geocode.js";
import { assessConnection, connectionLine } from "./connect.js";
import { roadRoute } from "./osrm.js";
import { feederRouter } from "./feeders/routes.js";

const app = express();
// Behind the web container's / front Nginx: take the client IP from
// X-Forwarded-For when the hop is a private (Docker) address.
app.set("trust proxy", "loopback, uniquelocal");
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

const q = (text, params) => pool.query(text, params).then((r) => r.rows);

// Per-IP request budget for the expensive endpoints (search hits external
// geocoders; best-source runs a route per GenCo).
function rateLimit({ perMinute }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now(), key = req.ip;
    const recent = (hits.get(key) || []).filter(t => now - t < 60_000);
    if (recent.length >= perMinute) return res.status(429).json({ error: "Too many requests — try again in a minute" });
    recent.push(now); hits.set(key, recent);
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    next();
  };
}

// ── Input rules ──────────────────────────────────────────────────────────
// Thrown from parsers; turned into a 400 by the error handler.
class BadRequest extends Error {}
const MAX_MW = 5000;

// A coordinate pair that must be inside Nigeria (null when both absent).
function parsePoint(latRaw, lngRaw, what = "point") {
  if (latRaw == null && lngRaw == null) return null;
  const lat = Number(latRaw), lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new BadRequest(`${what}: latitude and longitude must be numbers`);
  if (!inNigeria(lat, lng)) throw new BadRequest(`${what} (${lat}, ${lng}) is outside Nigeria`);
  return { lat, lng };
}
function parseMw(raw) {
  if (raw == null || raw === "") return undefined;
  const mw = Number(raw);
  if (!Number.isFinite(mw) || mw <= 0 || mw > MAX_MW) throw new BadRequest(`mw must be a number between 0 and ${MAX_MW}`);
  return mw;
}
function parseScope(raw) {
  if (raw == null || raw === "") return null;
  const st = normaliseStateName(raw);
  if (!st) throw new BadRequest(`Unknown state: ${raw}`);
  return st;
}

// Also under /api/ — the front Nginx only forwards /mapping/api/* here, so
// that's the only health URL reachable from outside (DEPLOY.md step 6).
app.get(["/health", "/api/health"], (_req, res) => res.json({ ok: true }));

// ── Raw network + parties ────────────────────────────────────────────────
// Each substation also carries the state / LGA it sits in (from the boundary
// data — not stored in the table), so search and routing can respect state.
app.get("/api/substations", async (_req, res, next) => {
  try {
    const rows = await q("SELECT name, voltage_kv, lat::float AS lat, lon::float AS lon, is_injection, status FROM substation ORDER BY name");
    res.json(rows.map(r => { const { state, lga } = locate(r.lat, r.lon); return { ...r, state, lga }; }));
  } catch (e) { next(e); }
});

app.get("/api/grid-edges", async (_req, res, next) => {
  try { res.json(await q("SELECT from_node, to_node, km::float AS km, status FROM grid_edge ORDER BY from_node")); }
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
async function resolveDestination({ dest, lat, lng, graph, scopeState = null }) {
  if (dest) {
    const [off] = await q("SELECT name, injection_node, last_mile_km::float AS last_mile_km, capacity_mw::float AS capacity_mw FROM offtaker WHERE name = $1", [dest]);
    if (off) return { label: off.name, kind: "offtaker", injectionNode: off.injection_node, lastMileKm: off.last_mile_km, destMw: off.capacity_mw };
    const [disco] = await q("SELECT name, injection_node, last_mile_km::float AS last_mile_km FROM disco WHERE name = $1", [dest]);
    if (disco) return { label: disco.name, kind: "disco", injectionNode: disco.injection_node, lastMileKm: disco.last_mile_km, destMw: null };
    return null;
  }
  if (lat != null && lng != null) {
    // Straight-line pick for WHICH substation is nearest (cheap, and fine even
    // for this — grid injection points are sparse enough that road-distance
    // rarely changes which one is closest). Only the last-mile KM/geometry for
    // that already-chosen substation gets upgraded to real road distance below.
    const nearest = nearestInjectionSubstation(graph, Number(lat), Number(lng), { scopeState });
    if (!nearest) return null;
    const subNode = graph.nodes.get(nearest.node);
    let lastMileKm = nearest.lastMileKm; // haversine fallback if OSRM is unreachable
    let lastMileGeometry = null;
    const road = subNode ? await roadRoute([subNode.lon, subNode.lat], [Number(lng), Number(lat)]) : null;
    if (road) { lastMileKm = Math.round(road.distanceKm * 10) / 10; lastMileGeometry = road.geometry; }
    return { label: `(${lat}, ${lng})`, kind: "point", injectionNode: nearest.node, lastMileKm, lastMileGeometry, destMw: null, snap: snapInfo(nearest) };
  }
  return null;
}

// Where the power enters the grid: a GenCo's own connection node, or — for
// any other point (a C&I site, an address, a plant Onction hasn't engaged) —
// the nearest built injection substation, reached over a "first mile".
// How a point was matched to the grid under a state scope (for the response).
function snapInfo(nearest) {
  if (!nearest.scopeChoice) return null;
  return { choice: nearest.scopeChoice, nearest_overall: nearest.nearestOverall || null, nearest_in_state: nearest.nearestInState || null };
}

async function resolveSource({ gencoName, fromLat, fromLng, graph, scopeState = null }) {
  if (gencoName) {
    const [genco] = await q(
      "SELECT name, connection_node, commitment, tariff_ngn_kwh::float AS tariff_ngn_kwh, capacity_note FROM genco WHERE name = $1",
      [gencoName]
    );
    if (!genco) return { error: `Unknown GenCo: ${gencoName}` };
    return { ...genco, kind: "genco", firstMileKm: 0, firstMileGeometry: null };
  }
  if (fromLat != null && fromLng != null) {
    const nearest = nearestInjectionSubstation(graph, Number(fromLat), Number(fromLng), { scopeState });
    if (!nearest) return { error: "No built substation near the starting point" };
    const subNode = graph.nodes.get(nearest.node);
    let firstMileKm = nearest.lastMileKm, firstMileGeometry = null;
    const road = subNode ? await roadRoute([Number(fromLng), Number(fromLat)], [subNode.lon, subNode.lat]) : null;
    if (road) { firstMileKm = Math.round(road.distanceKm * 10) / 10; firstMileGeometry = road.geometry; }
    return {
      name: `(${fromLat}, ${fromLng})`, kind: "point", connection_node: nearest.node,
      commitment: null, tariff_ngn_kwh: null, capacity_note: null, firstMileKm, firstMileGeometry, snap: snapInfo(nearest),
    };
  }
  return { error: "Provide genco=<name> or fromLat & fromLng" };
}

async function computeRouteFor({ gencoName, source, destination, lossModelCode, atccCode, destMwOverride, graph, scopeState = null }) {
  const genco = source || await resolveSource({ gencoName, graph });
  if (genco.error) return genco;

  const dest = destination;
  if (!dest) return { error: "Could not resolve destination" };

  const { dist, prev } = shortestPaths(graph, genco.connection_node, { scopeState });
  const cost = dist.get(dest.injectionNode);
  if (cost === undefined || cost === Infinity) {
    return { error: `No path from ${genco.connection_node} to ${dest.injectionNode} over built lines` };
  }
  const seq = buildPath(prev, genco.connection_node, dest.injectionNode);
  const hops = nodeSequenceToHops(graph, seq).map(h => ({
    ...h, from_state: graph.nodes.get(h.from_node)?.state || null, to_state: graph.nodes.get(h.to_node)?.state || null,
  }));
  const routedKm = pathKm(hops);

  const [lossModel] = await q(
    "SELECT code, label, fixed_pct::float AS fixed_pct, per_100km_pct::float AS per_100km_pct FROM loss_model WHERE code = $1",
    [lossModelCode || "base"]
  );
  if (!lossModel) throw new BadRequest(`Unknown loss model: ${lossModelCode}`);

  // State scope: which states the path actually passes through, and what
  // keeping it in-state cost compared with the plain shortest path.
  let scope = null;
  if (scopeState) {
    const pathNodes = seq.length ? seq : [genco.connection_node];
    const states = [...new Set(pathNodes.map(n => graph.nodes.get(n)?.state).filter(Boolean))];
    const outside = pathNodes.filter(n => graph.nodes.get(n)?.state !== scopeState).map(n => ({ node: n, state: graph.nodes.get(n)?.state || null }));
    const plain = shortestPaths(graph, genco.connection_node);
    const plainSeq = buildPath(plain.prev, genco.connection_node, dest.injectionNode) || [];
    const plainKm = pathKm(nodeSequenceToHops(graph, plainSeq));
    scope = {
      state: scopeState,
      path_states: states,
      stays_in_state: outside.length === 0,
      outside_nodes: outside,
      shortest_path_km: Math.round(plainKm * 10) / 10,
      extra_km_for_scope: Math.round((routedKm - plainKm) * 10) / 10,
      source_snap: genco.snap || null,
      dest_snap: dest.snap || null,
    };
  }
  const loss_pct = lossPct(routedKm, lossModel);
  const lastMileKm = dest.lastMileKm ?? 0;
  const totalKm = genco.firstMileKm + routedKm + lastMileKm;

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
    source_kind: genco.kind,                 // "genco" | "point"
    source_node: genco.connection_node,
    first_mile_km: genco.firstMileKm,        // 0 for a GenCo (it sits on its node)
    first_mile_geometry: genco.firstMileGeometry,
    commitment: genco.commitment,
    capacity_note: genco.capacity_note,
    tariff_ngn_kwh: genco.tariff_ngn_kwh,
    destination: dest.label,
    dest_kind: dest.kind,
    injection_node: dest.injectionNode,
    routed_km: Math.round(routedKm * 10) / 10,
    last_mile_km: lastMileKm,
    last_mile_geometry: dest.lastMileGeometry || null, // [lon,lat] road path, only set when OSRM resolved it
    total_km: Math.round(totalKm * 10) / 10,
    hop_count: hops.length,
    hops,
    loss_model: lossModel,
    loss_pct: Math.round(loss_pct * 100) / 100,
    dest_mw: destMw ?? null,
    scope,
    atcc_scenario: atcc,
    projection,
  };
}

// GET /api/route?genco=NDPHC%20Geregu&dest=GeePee&lossModel=base&scenario=dedicated
// GET /api/route?genco=NDPHC%20Geregu&lat=6.68&lng=3.235&mw=6&lossModel=base
// GET /api/route?fromLat=6.45&fromLng=3.39&dest=KEDCO   (from any point: nearest built substation + first mile)
app.get("/api/route", async (req, res, next) => {
  try {
    const { genco, dest, lossModel, scenario } = req.query;
    const from = parsePoint(req.query.fromLat, req.query.fromLng, "Starting point");
    const to = parsePoint(req.query.lat, req.query.lng, "Destination");
    const mw = parseMw(req.query.mw);
    const scopeState = parseScope(req.query.scopeState);
    if (!genco && !from) return res.status(400).json({ error: "Provide genco=<name> or fromLat & fromLng" });
    const graph = await loadGraph();
    const source = await resolveSource({ gencoName: genco, fromLat: from?.lat, fromLng: from?.lng, graph, scopeState });
    if (source.error) return res.status(404).json(source);
    const destination = await resolveDestination({ dest, lat: to?.lat, lng: to?.lng, graph, scopeState });
    if (!destination) return res.status(400).json({ error: "Provide dest=<offtaker/disco name> or lat & lng" });
    const result = await computeRouteFor({
      source, destination, lossModelCode: lossModel, atccCode: scenario, destMwOverride: mw, graph, scopeState,
    });
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (e) { next(e); }
});

// GET /api/best-source?dest=GeePee   OR   ?lat=&lng=&mw=
// Ranks every GenCo by total routed distance to the destination — the dynamic
// equivalent of v_best_source, but works for any point, not just known offtakers.
app.get("/api/best-source", rateLimit({ perMinute: 60 }), async (req, res, next) => {
  try {
    const { dest, lossModel, scenario } = req.query;
    const to = parsePoint(req.query.lat, req.query.lng, "Destination");
    const mw = parseMw(req.query.mw);
    if (!dest && !to) {
      return res.status(400).json({ error: "Provide dest=<offtaker/disco name> or lat & lng" });
    }
    const graph = await loadGraph();
    const destination = await resolveDestination({ dest, lat: to?.lat, lng: to?.lng, graph });
    if (!destination) return res.status(404).json({ error: "Destination not found" });

    const gencos = await q("SELECT name FROM genco ORDER BY name");
    const results = [];
    for (const g of gencos) {
      const r = await computeRouteFor({
        gencoName: g.name, destination, lossModelCode: lossModel, atccCode: scenario, destMwOverride: mw, graph,
      });
      if (!r.error) results.push(r);
    }
    results.sort((a, b) => a.total_km - b.total_km);
    res.json({ destination: destination.label, results });
  } catch (e) { next(e); }
});

// ── Connect workflow: find the customer, assess their connection ──────────

// GET /api/geocode/search?q=ABC%20Manufacturing%2C%20Ogun%20State
app.get("/api/geocode/search", rateLimit({ perMinute: 90 }), async (req, res, next) => {
  try { res.json(await searchPlaces(req.query.q, { limit: Math.min(10, Number(req.query.limit) || 8) })); }
  catch (e) { next(e); }
});

// GET /api/geocode/reverse?lat=&lng=   (dropped / dragged pin)
app.get("/api/geocode/reverse", rateLimit({ perMinute: 60 }), async (req, res, next) => {
  try {
    const pt = parsePoint(req.query.lat, req.query.lng, "Location");
    if (!pt) throw new BadRequest("lat and lng are required");
    res.json(await reversePlace(pt.lat, pt.lng));
  } catch (e) { next(e); }
});

app.get("/api/geocode/sources", (_req, res) => res.json(geocoderSources()));

// GET /api/locate?lat=&lng= → { state, lga } from the boundary data (no external call)
app.get("/api/locate", (req, res, next) => {
  try {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new BadRequest("lat and lng must be numbers");
    res.json(locate(lat, lng));
  } catch (e) { next(e); }
});

// GET /api/connect?lat=&lng=[&scopeState=Ogun|any]
// Nearby infrastructure, a suggested supply point and a planning indication.
app.get("/api/connect", async (req, res, next) => {
  try {
    const pt = parsePoint(req.query.lat, req.query.lng, "Customer location");
    if (!pt) throw new BadRequest("lat and lng are required");
    const scopeState = req.query.scopeState === "any" ? null : req.query.scopeState ? parseScope(req.query.scopeState) : undefined;
    res.json(assessConnection(await loadGraph(), { ...pt, scopeState }));
  } catch (e) { next(e); }
});

// GET /api/connect/line?lat=&lng=&substation=Ota%20132kV
app.get("/api/connect/line", async (req, res, next) => {
  try {
    const pt = parsePoint(req.query.lat, req.query.lng, "Customer location");
    if (!pt || !req.query.substation) throw new BadRequest("lat, lng and substation are required");
    const line = await connectionLine(await loadGraph(), { ...pt, substation: String(req.query.substation) });
    if (!line) return res.status(404).json({ error: `Unknown substation: ${req.query.substation}` });
    res.json(line);
  } catch (e) { next(e); }
});

// Live DisCo feeder data recorded by the poller.
app.use(feederRouter);

// Bad input → 400 with the reason; anything else → a generic 500 (details
// stay in the server log, not in the response).
app.use((err, _req, res, _next) => {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Internal error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`onction-grid-api listening on :${port}`));
