// "Which customers is this substation nearest to?" — the reverse of a site
// scan. Pure functions over the app's own data: the network (substations +
// lines from the grid API) and the customer lists (Onction offtakers, C&I
// anchor loads). Distances are straight-line.

import * as turf from "@turf/turf";

const haversineKm = (lat1, lng1, lat2, lng2) => turf.distance([lng1, lat1], [lng2, lat2], { units: "kilometers" });

export const NEAR_KM = 50;
const MAX_ROWS = 12;

const r1 = (x) => Math.round(x * 10) / 10;

// Built substations reached by at least one existing line (the ones power
// can actually be routed through), and which of them are listed supply points.
export function gridIndex(substations, edges) {
  const linked = new Set();
  for (const e of edges || []) if (e.status === "existing") { linked.add(e.from_node); linked.add(e.to_node); }
  const connected = (substations || []).filter(s => s.status === "existing" && linked.has(s.name));
  return { connected, isConnected: (name) => connected.some(s => s.name === name) };
}

export function customerList(offtakers, ciCustomers) {
  return [
    ...(offtakers || []).filter(o => o.lat != null).map(o => ({
      kind: "offtaker", name: o.name, lat: o.lat, lng: o.lon,
      sub: [o.location, o.capacity_mw && `${o.capacity_mw} MW`].filter(Boolean).join(" · "),
    })),
    ...(ciCustomers || []).map(c => ({
      kind: "ci", name: c.name, lat: c.lat, lng: c.lng, sub: [c.sector, c.state].filter(Boolean).join(" · "),
    })),
  ];
}

const nearestOf = (list, lat, lng) => {
  let best = null;
  for (const s of list) {
    const km = haversineKm(lat, lng, s.lat, s.lon);
    if (!best || km < best.km) best = { name: s.name, km: r1(km) };
  }
  return best;
};

// Customers near `sub`, nearest first. For each: is this substation the
// nearest grid-connected one to them, and which listed supply point the
// app would pick for them automatically.
export function customersNear(sub, { connected }, customers) {
  const listed = connected.filter(s => s.is_injection);
  const rows = customers.map(c => {
    const km = r1(haversineKm(c.lat, c.lng, sub.lat, sub.lon));
    const nearest = nearestOf(connected, c.lat, c.lng);
    return {
      ...c, km,
      nearestHere: nearest?.name === sub.name,
      nearest,
      autoSupply: nearestOf(listed, c.lat, c.lng),
    };
  }).sort((a, b) => a.km - b.km);
  const within = rows.filter(r => r.km <= NEAR_KM);
  return within.length
    ? { rows: within.slice(0, MAX_ROWS), total: within.length, beyond: false }
    : { rows: rows.slice(0, 5), total: 0, beyond: true };
}
