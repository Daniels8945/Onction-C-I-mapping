// Grid graph loading, Dijkstra shortest path, and loss/energy calculations
// over the TCN substation network — the in-app equivalent of section 6
// (recursive CTE) and views 5a-5c in onction_grid_1.sql.

import { pool } from "./db.js";

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

export async function loadGraph() {
  const [{ rows: substations }, { rows: edges }] = await Promise.all([
    pool.query("SELECT name, voltage_kv, lat::float AS lat, lon::float AS lon, is_injection FROM substation"),
    pool.query("SELECT from_node, to_node, km::float AS km FROM grid_edge"),
  ]);

  const nodes = new Map(substations.map((s) => [s.name, s]));
  const adjacency = new Map(substations.map((s) => [s.name, []]));
  for (const e of edges) {
    adjacency.get(e.from_node)?.push({ to: e.to_node, km: e.km });
    adjacency.get(e.to_node)?.push({ to: e.from_node, km: e.km });
  }
  return { nodes, adjacency };
}

// Single-source Dijkstra over the (small, ~53-node) substation graph.
export function shortestPaths(graph, sourceName) {
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
      const alt = dist.get(u) + km;
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

export function nearestInjectionSubstation(graph, lat, lon) {
  let best = null, bestKm = Infinity;
  for (const s of graph.nodes.values()) {
    if (!s.is_injection) continue;
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < bestKm) { bestKm = d; best = s; }
  }
  return best ? { node: best.name, lastMileKm: Math.round(bestKm * 10) / 10 } : null;
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
