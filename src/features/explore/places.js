// Every place Explore can search, scan or route between — built from the
// app's data and Onction's engagements — plus the matching used by the
// command palette and the From/To pickers.
//
// Each item says how the routing API should treat it (`asSource`,
// `asDest`): a named Onction GenCo / offtaker / DisCo routes via its curated
// connection node; anything else routes from/to its coordinates.

import { CI_CUSTOMERS, DISCOS, GENCOS } from "@/data";
import { availabilityOf } from "./siteScan";

export const KIND_LABEL = {
  action: "Action", genco: "Onction GenCo", plant: "Power plant", offtaker: "Onction offtaker",
  substation: "TCN substation", disco: "DisCo", ci: "C&I anchor load", pin: "Your pin", address: "Address",
  site: "Scanned site",
};

// The routing DB names two DisCos differently from the app's ids.
const DB_DISCO_ALIAS = { EKEDC: "Eko DisCo", JEDC: "JED (Jos)" };

export function buildPlaceIndex({ gridParties, substations, pins }) {
  const dbDiscos = new Set(gridParties.discos.map(d => d.name));
  const onctionGencoNames = new Set(gridParties.gencos.map(g => g.name));
  return [
    ...gridParties.gencos.filter(g => g.lat != null).map(g => {
      const avail = availabilityOf(g.commitment);
      return {
        kind: "genco", name: g.name, sub: [avail.label, g.capacity_note].filter(Boolean).join(" · "), avail: avail.key,
        lat: g.lat, lng: g.lon, keywords: `genco generator plant ${g.connection_node || ""}`, asSource: { genco: g.name },
      };
    }),
    // Reference plants Onction hasn't engaged — routable as points.
    ...GENCOS.filter(g => !onctionGencoNames.has(g.name)).map(g => ({
      kind: "plant", name: g.name, sub: [g.subtype, g.fuel, g.capacity && `${g.capacity} MW`].filter(Boolean).join(" · "),
      lat: g.lat, lng: g.lng, keywords: `genco plant generator ${g.type || ""} ${g.owner || ""}`,
    })),
    ...gridParties.offtakers.filter(o => o.lat != null).map(o => ({
      kind: "offtaker", name: o.name, sub: [o.location, o.capacity_mw && `${o.capacity_mw} MW`].filter(Boolean).join(" · "),
      lat: o.lat, lng: o.lon, keywords: `offtaker customer ${o.location || ""}`, asDest: { dest: o.name },
    })),
    ...substations.map(s => ({
      kind: "substation", name: s.name, sub: `${s.voltage_kv} kV · ${s.status}`, lat: s.lat, lng: s.lon,
      keywords: `substation ss tcn ${s.voltage_kv}kv`,
    })),
    ...DISCOS.map(d => {
      const dbName = DB_DISCO_ALIAS[d.id] || d.id;
      return {
        kind: "disco", name: d.id, sub: d.name, lat: d.lat, lng: d.lng,
        keywords: `disco distribution ${d.states || ""}`,
        ...(dbDiscos.has(dbName) && { asDest: { dest: dbName } }),
      };
    }),
    ...CI_CUSTOMERS.map(c => ({
      kind: "ci", name: c.name, sub: [c.sector, c.state].filter(Boolean).join(" · "), lat: c.lat, lng: c.lng,
      keywords: `c&i customer ${c.sector || ""} ${c.state || ""}`,
    })),
    ...pins.map(p => ({ kind: "pin", name: p.label, sub: `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`, lat: p.lat, lng: p.lng, keywords: "pin" })),
  ];
}

const norm = (t) => String(t || "").toLowerCase().replace(/[()—–\-,.·]/g, " ");

// Every query word must appear somewhere (name, subtitle or keywords);
// name matches rank above subtitle/keyword matches, prefixes above the rest.
export function scorePlace(item, query) {
  const q = norm(query).trim();
  if (!q) return 0;
  const name = norm(item.name);
  const hay = `${name} ${norm(item.sub)} ${norm(item.keywords)}`;
  const tokens = q.split(/\s+/);
  if (!tokens.every(t => hay.includes(t))) return 0;
  if (name.startsWith(q)) return 5;
  if (name.includes(q)) return 4;
  if (tokens.every(t => name.split(/\s+/).some(w => w.startsWith(t)))) return 3;
  if (tokens.every(t => name.includes(t))) return 2.5;
  return 1;
}

// What each end of a route most likely means: "Dadin Kowa" as a From is the
// Mabon GenCo there, not the substation of the same name.
export const FROM_BIAS = { genco: 1.5, plant: 1 };
export const TO_BIAS = { disco: 1.5, offtaker: 1.5, ci: 0.5 };

export function searchPlaces(index, query, { perKind = 5, limit = 30, bias = null } = {}) {
  const counts = {};
  return index
    .map(i => { const s = scorePlace(i, query); return { ...i, s: s > 0 ? s + (bias?.[i.kind] || 0) : 0 }; })
    .filter(i => i.s > 0)
    .sort((a, b) => b.s - a.s)
    .filter(i => (counts[i.kind] = (counts[i.kind] || 0) + 1) <= perKind)
    .slice(0, limit);
}

// "dadin kowa to kano disco" → { from: "dadin kowa", to: "kano disco" }
export function parseRouteQuery(query) {
  const m = String(query).match(/^\s*(?:from\s+)?(.+?)\s+(?:to|→|->)\s+(.+?)\s*$/i);
  return m && m[1].length >= 2 && m[2].length >= 2 ? { from: m[1], to: m[2] } : null;
}

// The API parameters for a place at one end of a route.
export function routeParams(from, to) {
  return {
    ...(from.asSource || { fromLat: from.lat, fromLng: from.lng }),
    ...(to.asDest || { lat: to.lat, lng: to.lng }),
  };
}
