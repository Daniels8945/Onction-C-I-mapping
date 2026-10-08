// Grid graph loading, Dijkstra shortest path, and loss/energy calculations
// over the TCN substation network — the in-app equivalent of section 6
// (recursive CTE) and views 5a-5c in onction_grid_1.sql.

import { pool } from "./db.js";
import { locate } from "./geo/admin.js";

// State-scoped routing ("keep this within Ogun") picks the path with the
// fewest kilometres of line outside the state, then the shortest overall: an
// in-state path always wins when one exists, and a path that genuinely has
// to leave (e.g. Ogun's 132 kV substations, fed radially from Ikeja West in
// Lagos) leaves for as short a stretch as possible. Implemented as a cost
// where out-of-state km weigh OUTSIDE_WEIGHT× more — large enough to be
// lexicographic at grid scale. Reported distances are always real km.
const OUTSIDE_WEIGHT = 1000;
// When snapping a point to the grid in a state-scoped query, an in-state
// substation is preferred over a nearer out-of-state one unless it's more
// than this much farther (km, or ×, whichever allows more).
const IN_STATE_SNAP_EXTRA_KM = 15;
const IN_STATE_SNAP_RATIO = 1.5;
const GRAPH_TTL_MS = 60_000;

const R_KM = 6371;
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// The network changes rarely; cache it briefly instead of re-reading it (and
// re-locating every substation) on every request.
let cached = null;
export async function loadGraph() {
  if (cached && Date.now() - cached.at < GRAPH_TTL_MS) return cached.graph;
  const [{ rows: substations }, { rows: edges }] = await Promise.all([
    pool.query("SELECT name, voltage_kv, lat::float AS lat, lon::float AS lon, is_injection, status FROM substation"),
    // Only "existing" corridors are real, built lines — ongoing/proposed ones
    // (e.g. the not-yet-built Kano-Katsina-Sokoto-Birnin Kebbi stretch) are
    // stored for the map's reference layer (kept below as `corridors`) but
    // must never carry a route.
    pool.query("SELECT from_node, to_node, km::float AS km, status FROM grid_edge"),
  ]);

  for (const s of substations) Object.assign(s, locate(s.lat, s.lon)); // + state, lga
  const nodes = new Map(substations.map((s) => [s.name, s]));
  const adjacency = new Map(substations.map((s) => [s.name, []]));
  for (const e of edges) {
    if (e.status !== "existing") continue;
    adjacency.get(e.from_node)?.push({ to: e.to_node, km: e.km });
    adjacency.get(e.to_node)?.push({ to: e.from_node, km: e.km });
  }
  // Every corridor, built or not — for showing what's near a site; only
  // `adjacency` (built lines) is ever routed over.
  const graph = { nodes, adjacency, corridors: edges.filter(e => nodes.has(e.from_node) && nodes.has(e.to_node)) };
  cached = { at: Date.now(), graph };
  return graph;
}

// Single-source Dijkstra over the (small) substation graph. With scopeState,
// `dist` is the scoped cost above, not km — use pathKm() for distance.
export function shortestPaths(graph, sourceName, { scopeState = null } = {}) {
  const outside = (n) => scopeState && graph.nodes.get(n)?.state !== scopeState;
  const dist = new Map([...graph.nodes.keys()].map((n) => [n, Infinity]));
  const prev = new Map();
  const visited = new Set();
  if (!graph.nodes.has(sourceName)) return { dist, prev };
  dist.set(sourceName, 0);

  while (visited.size < graph.nodes.size) {
    let u = null, best = Infinity;
    for (const [n, d] of dist) {
      if (!visited.has(n) && d < best) { best = d; u = n; }
    }
    if (u === null) break;
    visited.add(u);
    for (const { to, km } of graph.adjacency.get(u) || []) {
      const alt = dist.get(u) + km * (outside(u) || outside(to) ? OUTSIDE_WEIGHT : 1);
      if (alt < dist.get(to)) { dist.set(to, alt); prev.set(to, u); }
    }
  }
  return { dist, prev };
}

export function buildPath(prev, source, target) {
  if (source === target) return [];
  const path = [];
  let cur = target;
  while (cur !== source) {
    const p = prev.get(cur);
    if (p === undefined) return null; // unreachable
    path.unshift(cur);
    cur = p;
  }
  path.unshift(source);
  return path;
}

export function nodeSequenceToHops(graph, seq) {
  const hops = [];
  for (let i = 0; i < seq.length - 1; i++) {
    const from = seq[i], to = seq[i + 1];
    const edge = graph.adjacency.get(from)?.find((e) => e.to === to);
    hops.push({ seq: i + 1, from_node: from, to_node: to, km: edge ? Math.round(edge.km * 100) / 100 : null });
  }
  return hops;
}

export function pathKm(hops) {
  return hops.reduce((a, h) => a + (h.km || 0), 0);
}

// Built substations that some existing line reaches — a proposed one (e.g.
// Wukari) is often the nearest, but nothing can route to it.
export const isGridSupplyPoint = (graph, s) =>
  s.is_injection && s.status === "existing" && !!graph.adjacency.get(s.name)?.length;

// Where a point joins the grid. With scopeState, an in-state supply point is
// preferred unless it's much farther than the nearest one overall; the
// response says which was chosen and why (`scope`).
export function nearestInjectionSubstation(graph, lat, lon, { scopeState = null } = {}) {
  let best = null, bestKm = Infinity, inState = null, inStateKm = Infinity;
  for (const s of graph.nodes.values()) {
    if (!isGridSupplyPoint(graph, s)) continue;
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < bestKm) { bestKm = d; best = s; }
    if (scopeState && s.state === scopeState && d < inStateKm) { inStateKm = d; inState = s; }
  }
  if (!best) return null;
  const r1 = (x) => Math.round(x * 10) / 10;
  if (scopeState && inState && inState !== best &&
      inStateKm <= Math.max(bestKm + IN_STATE_SNAP_EXTRA_KM, bestKm * IN_STATE_SNAP_RATIO)) {
    return { node: inState.name, lastMileKm: r1(inStateKm), scopeChoice: "in-state", nearestOverall: { node: best.name, km: r1(bestKm), state: best.state } };
  }
  return {
    node: best.name, lastMileKm: r1(bestKm),
    scopeChoice: !scopeState ? null : best.state === scopeState ? "in-state" : inState ? "in-state-too-far" : "no-in-state",
    ...(scopeState && inState && inState !== best && { nearestInState: { node: inState.name, km: r1(inStateKm) } }),
  };
}

export function lossPct(routedKm, lossModel) {
  return lossModel.fixed_pct + (routedKm / 100) * lossModel.per_100km_pct;
}

export function energyProjection({ destMw, lossPctValue, atccPct }) {
  const contracted_kwh = destMw * 1000 * 24 * 30;
  const delivered_kwh = contracted_kwh * (1 - lossPctValue / 100);
  const recovered_kwh = atccPct != null ? delivered_kwh * (1 - atccPct / 100) : null;
  const transmission_loss_kwh = contracted_kwh * (lossPctValue / 100);
  const atcc_loss_kwh = atccPct != null ? delivered_kwh * (atccPct / 100) : null;
  return { contracted_kwh, delivered_kwh, recovered_kwh, transmission_loss_kwh, atcc_loss_kwh };
}

export { haversineKm };
