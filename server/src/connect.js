// Connection assessment — the core question of the Connect workflow:
// "a customer is HERE; what electricity infrastructure could serve them, how
// far is it, and is there an infrastructure gap?"
//
// Uses only what the dataset holds: TCN substations (330/132 kV, with
// status and whether they're grid supply points) and transmission lines.
// The distribution network (33/11 kV feeders) isn't mapped in the dataset,
// so a nearer DisCo connection may exist — the response says so.
//
// The result is an initial planning / feasibility indication, never an
// engineering decision: bands are by straight-line distance and are
// constants here (DISTANCE_BANDS) so they can be tuned.

import { haversineKm, isGridSupplyPoint, nearestInjectionSubstation } from "./grid.js";
import { locate } from "./geo/admin.js";
import { roadRoute } from "./osrm.js";

export const DISTANCE_BANDS = [
  { maxKm: 10, level: "near", title: "Near existing infrastructure",
    summary: (s, km) => `${s} is ${km} km away. A connection from it looks plausible in principle.` },
  { maxKm: 30, level: "moderate", title: "Moderate distance",
    summary: (s, km) => `${s} is ${km} km away. Connecting would likely need a dedicated line of roughly that length.` },
  { maxKm: 75, level: "extension", title: "Network extension likely",
    summary: (s, km) => `The nearest grid supply point, ${s}, is ${km} km away. Serving this site from the grid would likely need a significant line or network extension.` },
  { maxKm: Infinity, level: "gap", title: "Infrastructure gap",
    summary: (s, km) => `The nearest grid supply point, ${s}, is ${km} km away. This looks like an infrastructure gap: new infrastructure (e.g. a new substation or major extension) or on-site generation may be needed.` },
];
// The search radius around the customer: the user picks it (RADIUS_OPTIONS
// in the UI); infrastructure inside it is listed and drawn. The suggested
// supply point is always given, even when it lies outside.
export const DEFAULT_RADIUS_KM = 50;
export const MAX_RADIUS_KM = 300;
const MAX_CANDIDATES = 12;
const MAX_LINES = 25;
const r1 = (x) => Math.round(x * 10) / 10;

// Distance from a point to a line segment, km (local equirectangular).
function pointToSegmentKm(lat, lng, a, b) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57;
  const px = lng * kx, py = lat * ky;
  const ax = a.lon * kx, ay = a.lat * ky, bx = b.lon * kx, by = b.lat * ky;
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  const cx = ax + t * dx, cy = ay + t * dy;
  return { km: Math.hypot(px - cx, py - cy), point: [cx / kx, cy / ky] };
}

// Line voltage isn't in the dataset; a corridor runs at the lower of its two
// substations' voltages (a 330 kV station feeding a 132 kV one does so at
// 132 kV), and the response says it's inferred.
function describeCorridor(graph, e, lat, lng, customerState) {
  const a = graph.nodes.get(e.from_node), b = graph.nodes.get(e.to_node);
  const d = pointToSegmentKm(lat, lng, a, b);
  return {
    from_node: e.from_node, to_node: e.to_node, status: e.status, line_km: r1(e.km),
    voltage_kv: Math.min(a.voltage_kv, b.voltage_kv), voltage_inferred: true,
    distance_km: r1(d.km), point: d.point,
    from_state: a.state || null, to_state: b.state || null,
    crosses_state: !!a.state && !!b.state && a.state !== b.state,
    in_customer_state: !!customerState && (a.state === customerState || b.state === customerState),
    coordinates: [[a.lon, a.lat], [b.lon, b.lat]],
  };
}

function describe(graph, s, lat, lng, customerState) {
  const lines = (graph.adjacency.get(s.name) || []).map(e => ({ to: e.to, km: r1(e.km), to_state: graph.nodes.get(e.to)?.state || null }));
  return {
    name: s.name, voltage_kv: s.voltage_kv, status: s.status,
    is_injection: s.is_injection,
    grid_connected: lines.length > 0,          // reached by at least one built line
    supply_point: isGridSupplyPoint(graph, s), // built + injection + connected
    state: s.state, lga: s.lga, lat: s.lat, lon: s.lon,
    distance_km: r1(haversineKm(lat, lng, s.lat, s.lon)),
    same_state: !!customerState && s.state === customerState,
    lines,
  };
}

export function assessConnection(graph, { lat, lng, scopeState, radiusKm = DEFAULT_RADIUS_KM }) {
  const { state, lga } = locate(lat, lng);
  const customerState = state;
  const scope = scopeState === undefined ? customerState : scopeState; // default: the customer's own state

  const all = [...graph.nodes.values()].map(s => describe(graph, s, lat, lng, customerState)).sort((a, b) => a.distance_km - b.distance_km);
  const inRadius = all.filter(c => c.distance_km <= radiusKm);
  // Within a state context, that state's infrastructure is listed first —
  // the filter is about what the user is exploring, not a claim that power
  // can't cross the boundary (out-of-state candidates stay, flagged).
  const inScopeFirst = (list) => scope ? [...list.filter(c => c.state === scope), ...list.filter(c => c.state !== scope)] : list;
  const candidates = inScopeFirst(inRadius).slice(0, MAX_CANDIDATES).map(c => ({ ...c, in_radius: true }));

  // Recommended: the nearest grid supply point, preferring the customer's
  // state under the same rule routing uses.
  const pick = nearestInjectionSubstation(graph, lat, lng, { scopeState: scope });
  const recommendedRow = pick ? all.find(c => c.name === pick.node) : null;
  // Nothing inside the radius: still show the nearest few beyond it, so
  // the user sees how far the network is rather than an empty list.
  if (!candidates.length) all.slice(0, 3).forEach(c => candidates.push({ ...c, in_radius: false }));
  let recommended = recommendedRow && candidates.find(c => c.name === recommendedRow.name);
  if (recommendedRow && !recommended) { recommended = { ...recommendedRow, in_radius: recommendedRow.distance_km <= radiusKm }; candidates.push(recommended); }
  const ordered = inScopeFirst(candidates);

  // Transmission corridors near the site, built or not (status says which).
  const corridors = (graph.corridors || []).map(e => describeCorridor(graph, e, lat, lng, customerState))
    .sort((a, b) => a.distance_km - b.distance_km);
  const nearbyLines = corridors.filter(l => l.distance_km <= radiusKm).slice(0, MAX_LINES);

  // Nearest built transmission line (drawn as straight spans between
  // substations, so this is approximate).
  let nearestLine = null;
  const seen = new Set();
  for (const [from, edges] of graph.adjacency) {
    for (const e of edges) {
      const key = [from, e.to].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const a = graph.nodes.get(from), b = graph.nodes.get(e.to);
      if (!a || !b) continue;
      const d = pointToSegmentKm(lat, lng, a, b);
      if (!nearestLine || d.km < nearestLine.distance_km) {
        nearestLine = { from_node: from, to_node: e.to, line_km: r1(e.km), distance_km: r1(d.km), point: d.point };
      }
    }
  }

  // The indication.
  const considerations = [];
  let assessment;
  if (!recommended) {
    assessment = { level: "gap", title: "Infrastructure gap", summary: "No built grid supply point was found in the dataset." };
  } else {
    const band = DISTANCE_BANDS.find(b => recommended.distance_km <= b.maxKm);
    assessment = { level: band.level, title: band.title, summary: band.summary(recommended.name, recommended.distance_km) };
    const closerPlanned = all.find(c => c.status !== "existing" && c.distance_km < recommended.distance_km);
    if (closerPlanned) considerations.push(`${closerPlanned.name} (${closerPlanned.status}) is ${closerPlanned.distance_km} km away — if built, it could change this picture.`);
    const closerBuilt = all.find(c => c.status === "existing" && !c.supply_point && c.distance_km < recommended.distance_km);
    if (closerBuilt) considerations.push(`${closerBuilt.name} is nearer (${closerBuilt.distance_km} km) but isn't a supply point for customers in the network data.`);
    if (pick.scopeChoice === "in-state" && pick.nearestOverall) considerations.push(`${pick.nearestOverall.node} in ${pick.nearestOverall.state} is slightly nearer (${pick.nearestOverall.km} km); the ${scope} supply point is suggested to keep the connection in-state.`);
    if (recommended.state && customerState && recommended.state !== customerState) considerations.push(`The suggested supply point is in ${recommended.state}, across the state boundary from the customer (${customerState}).`);
    if (nearestLine && nearestLine.distance_km < recommended.distance_km - 5) considerations.push(`A built transmission line (${nearestLine.from_node} – ${nearestLine.to_node}) passes about ${nearestLine.distance_km} km away; tapping a transmission line would itself need a new substation.`);
  }
  considerations.push("The 33/11 kV distribution network isn't in the dataset — a nearer DisCo feeder connection may exist.");

  // What's inside the radius, in words — the honest "is anything near?".
  const supplyIn = inRadius.filter(c => c.supply_point);
  const builtLinesIn = nearbyLines.filter(l => l.status === "existing");
  let radiusMessage;
  if (!inRadius.length && !nearbyLines.length) radiusMessage = `No transmission infrastructure identified within ${radiusKm} km in the network data.`;
  else if (!supplyIn.length) radiusMessage = `No grid supply point identified within ${radiusKm} km${inRadius.length ? ` (${inRadius.length} other substation${inRadius.length > 1 ? "s" : ""} nearby)` : ""}.`;
  else radiusMessage = `${supplyIn.length} grid supply point${supplyIn.length > 1 ? "s" : ""} and ${builtLinesIn.length} built line${builtLinesIn.length === 1 ? "" : "s"} within ${radiusKm} km.`;

  return {
    customer: { lat, lng, state, lga },
    scope_state: scope || null,
    radius_km: radiusKm,
    radius_summary: {
      substations: inRadius.length, supply_points: supplyIn.length, lines: nearbyLines.length, built_lines: builtLinesIn.length,
      nearest_substation_km: all[0]?.distance_km ?? null, nearest_line_km: corridors[0]?.distance_km ?? null,
      empty: !supplyIn.length, message: radiusMessage,
    },
    candidates: ordered.map(c => ({ ...c, recommended: c === recommended })),
    recommended: recommended?.name || null,
    nearest_line: nearestLine,
    nearby_lines: nearbyLines,
    assessment: {
      ...assessment, considerations,
      bands: DISTANCE_BANDS.map(b => ({ level: b.level, title: b.title, max_km: Number.isFinite(b.maxKm) ? b.maxKm : null })),
      disclaimer: "Initial planning indication from straight-line distance and the network dataset — not an engineering assessment. Capacity, right-of-way and costs need a proper study.",
    },
  };
}

// The connection line for a chosen substation: always the straight line;
// the road route too when the routing service (OSRM) is running.
export async function connectionLine(graph, { lat, lng, substation }) {
  const s = graph.nodes.get(substation);
  if (!s) return null;
  const road = await roadRoute([lng, lat], [s.lon, s.lat]);
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(s.lon - lng)) * Math.cos(toRad(s.lat));
  const x = Math.cos(toRad(lat)) * Math.sin(toRad(s.lat)) - Math.sin(toRad(lat)) * Math.cos(toRad(s.lat)) * Math.cos(toRad(s.lon - lng));
  return {
    substation: s.name,
    straight_km: r1(haversineKm(lat, lng, s.lat, s.lon)),
    bearing_deg: Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360),
    road_km: road ? r1(road.distanceKm) : null,
    road_geometry: road?.geometry || null,
  };
}
