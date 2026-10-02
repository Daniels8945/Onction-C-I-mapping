// Nigeria's administrative geography (states + LGAs, see ../../data/README.md)
// for the server: which state / LGA a point is in, whether it's in Nigeria at
// all, and which state a search query names. Plain point-in-polygon with a
// bounding-box prefilter — fast enough for per-request use (37 + 774 shapes).

import fs from "node:fs";

const load = (file) => JSON.parse(fs.readFileSync(new URL(`../../data/${file}`, import.meta.url), "utf8")).features;

function bboxOf(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) for (const [x, y] of poly[0]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inGeometry(x, y, geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polys.some(([outer, ...holes]) => inRing(x, y, outer) && !holes.some(h => inRing(x, y, h)));
}

function index(features) {
  return features.map(f => ({ name: f.properties.name, geometry: f.geometry, bbox: bboxOf(f.geometry) }));
}

function find(shapes, lat, lng) {
  for (const s of shapes) {
    const [a, b, c, d] = s.bbox;
    if (lng < a || lng > c || lat < b || lat > d) continue;
    if (inGeometry(lng, lat, s.geometry)) return s;
  }
  return null;
}

const STATES = index(load("ng-states.geojson"));
const LGAS = index(load("ng-lgas.geojson"));

export const STATE_NAMES = STATES.map(s => s.name).sort();

// { state, lga } for a point; state is null outside Nigeria. (Simplified
// boundaries can disagree by a few metres right on an LGA line.)
export function locate(lat, lng) {
  const state = find(STATES, lat, lng);
  if (!state) return { state: null, lga: null, inNigeria: false };
  return { state: state.name, lga: find(LGAS, lat, lng)?.name || null, inNigeria: true };
}

export function stateBBox(name) {
  return STATES.find(s => s.name === name)?.bbox || null;
}

// "ABC Manufacturing, Ogun State" → "Ogun". Longest names first so
// "Cross River" isn't read as something shorter; "Abuja"/"FCT" → FCT.
const STATE_ALIASES = [
  ...STATE_NAMES.filter(n => n !== "FCT").map(n => [n.toLowerCase(), n]),
  ["federal capital territory", "FCT"], ["fct", "FCT"], ["abuja", "FCT"],
].sort((a, b) => b[0].length - a[0].length);

export function stateInText(text) {
  const t = ` ${String(text).toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ")} `;
  for (const [alias, name] of STATE_ALIASES) if (t.includes(` ${alias} `)) return name;
  return null;
}

export function normaliseStateName(s) {
  if (!s) return null;
  const k = String(s).toLowerCase().replace(/\s+state$/, "").trim();
  return STATE_ALIASES.find(([alias]) => alias === k)?.[1] || null;
}

export function inNigeria(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && !!find(STATES, lat, lng);
}
