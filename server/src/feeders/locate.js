// Where each feeder is. The feeder-compliance API gives no coordinates —
// only the station a feeder hangs off ("ADEKUNLE FAJUYI ISS", "AJAH TS") and
// its state. So feeders are placed AT THEIR STATION, found in this order:
//   network   the station is a substation in Onction's network data (same
//             state, same name)
//   google    Google Places finds the station by name inside that state
//             ("site" when the result is an electrical facility; "area" when
//             Google only knows a place or street of that name — approximate)
//   none      not found; the feeder is listed but not drawn
// Each lookup is stored (feeder_station_location) and done once per station;
// new stations are picked up a few at a time in the background.

import { pool } from "../db.js";
import { locate, normaliseStateName, stateBBox } from "../geo/admin.js";

const GOOGLE_KEY = (process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEYS || "").trim();
const BATCH = 20;              // stations looked up per round
const ROUND_MS = 60_000;       // one round a minute until all are done
const RETRY_NONE_DAYS = 14;    // look again for stations not found after this

export const DDL = `
CREATE TABLE IF NOT EXISTS feeder_station_location (
  station      text NOT NULL,
  state        text NOT NULL,
  lat          double precision,
  lon          double precision,
  method       text NOT NULL,           -- network | google | none
  precision    text,                    -- site | area (google only)
  matched_name text,                    -- what it was matched to
  address      text,
  looked_up_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station, state)
);`;

// "ADEKUNLE FAJUYI ISS" → { name: "adekunle fajuyi", kind: "injection" }
const KIND_WORDS = [
  [/\b(t\/?s|ts|transmission station|trans station)\b/g, "transmission"],
  [/\b(iss|inj|injection|injection substation|local inj|s\/s|substation|sub station)\b/g, "injection"],
];
export function cleanStation(raw) {
  let s = String(raw || "").toLowerCase().replace(/[()]/g, " ").replace(/\b\d+\s*(\/\s*\d+)?\s*kv\b/g, " ");
  let kind = null;
  for (const [re, k] of KIND_WORDS) if (re.test(s)) { kind = kind || k; s = s.replace(re, " "); }
  s = s.replace(/\blocal\b/g, " ").replace(/[^a-z0-9/ ]/g, " ").replace(/\s+/g, " ").trim();
  return { name: s, kind: kind || "injection" };
}
export const tokens = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(t => t.length > 2 && !["kv", "the"].includes(t));
const base = (name) => tokens(String(name).replace(/\b\d+\s*kv\b/ig, "")).join(" ");

// The feed sometimes gives a city where the state should be.
const STATE_ALIASES = { "port harcourt": "Rivers", "ph": "Rivers", "abuja": "Federal Capital Territory", "fct": "Federal Capital Territory", "eko": "Lagos" };
export const stateOf = (raw) => normaliseStateName(STATE_ALIASES[String(raw || "").trim().toLowerCase()] || raw);

// 1. A substation in the network data, same state: a transmission station
// whose name contains the station's, or any station with exactly its name.
// ("Apapa Road" injection is not the "Apapa" 132 kV station.)
export function matchNetwork(clean, state, substations) {
  const want = tokens(clean.name);
  if (!want.length) return null;
  return substations.find(s => {
    if (s.state !== state || s.status !== "existing") return false;
    if (base(s.name) === want.join(" ")) return true;
    const have = tokens(s.name.replace(/\b\d+\s*kv\b/i, ""));
    // "AJAH TS" is the "Aja/Ajah" transmission station: every word of the
    // feed's name appears in ours (ours may carry a variant spelling too).
    return clean.kind === "transmission" && have.length && want.every(t => have.includes(t));
  }) || null;
}

const ELECTRICAL = /substation|injection|\binj\b|transmission|\bkv\b|\btcn\b|\bphcn\b|\bnepa\b|power holding/i;

// 2. Google Places, inside the state: first the station itself (an
// electrical facility sharing a word of its name → "site"); failing that, the
// place it's named after ("area", approximate). Two queries at most.
async function places(textQuery, bb) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.types" },
    body: JSON.stringify({ textQuery, regionCode: "NG", maxResultCount: 5,
      ...(bb && { locationRestriction: { rectangle: { low: { latitude: bb[1], longitude: bb[0] }, high: { latitude: bb[3], longitude: bb[2] } } } }) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Google Places ${r.status}`);
  return ((await r.json()).places || []).map(p => ({ name: p.displayName?.text || "", address: p.formattedAddress || "", lat: p.location.latitude, lon: p.location.longitude, types: p.types || [] }));
}

export async function matchGoogle(clean, state) {
  if (!GOOGLE_KEY || !clean.name) return null;
  const bb = stateBBox(state);
  const want = tokens(clean.name);
  // A word of the station's name must appear in the place's name, or in its
  // address unless that word is just the state's name ("Ondo TS" isn't in
  // Akure because the address says "Ondo").
  const stateWords = new Set(tokens(state));
  const ok = (p) => locate(p.lat, p.lon).state === state
    && want.some(t => tokens(p.name).includes(t) || (!stateWords.has(t) && tokens(p.address).includes(t)));
  const station = (await places(`${clean.name} ${clean.kind} substation, ${state} State, Nigeria`, bb)).filter(ok);
  const site = station.find(p => ELECTRICAL.test(p.name));
  if (site) return { ...site, precision: "site" };
  // An area match must carry the station's name in the place's own name —
  // an address that merely mentions it ("…, Damaturu Rd") isn't the place.
  const named = (p) => want.some(t => tokens(p.name).includes(t));
  const area = (await places(`${clean.name}, ${state} State, Nigeria`, bb)).filter(ok).find(named) || station.find(named);
  return area ? { ...area, precision: "area" } : null;
}

// Look up up to BATCH stations that have no stored location yet (or whose
// "not found" is old). Returns how many were looked up.
export async function locateSomeStations(graph) {
  await pool.query(DDL);
  const { rows } = await pool.query(`
    SELECT DISTINCT f.station, f.state FROM feeder f
    LEFT JOIN feeder_station_location l ON l.station = f.station AND l.state = f.state
    WHERE f.station IS NOT NULL AND f.state IS NOT NULL
      AND (l.station IS NULL OR (l.method = 'none' AND l.looked_up_at < now() - make_interval(days => $1)))
    LIMIT $2`, [RETRY_NONE_DAYS, BATCH]);
  const substations = [...graph.nodes.values()];
  for (const { station, state: rawState } of rows) {
    const state = stateOf(rawState);
    const clean = cleanStation(station);
    let row = { method: "none", lat: null, lon: null, precision: null, matched_name: null, address: null };
    if (state) {
      const net = matchNetwork(clean, state, substations);
      if (net) row = { method: "network", lat: net.lat, lon: net.lon, precision: "site", matched_name: net.name, address: null };
      else {
        try {
          const g = await matchGoogle(clean, state);
          if (g) row = { method: "google", lat: g.lat, lon: g.lon, precision: g.precision, matched_name: g.name, address: g.address };
        } catch (e) { console.error(`feeder station lookup failed (${station}, ${rawState}): ${e.message}`); continue; } // try again next round
      }
    }
    await pool.query(`
      INSERT INTO feeder_station_location (station, state, lat, lon, method, precision, matched_name, address, looked_up_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
      ON CONFLICT (station, state) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon, method = EXCLUDED.method,
        precision = EXCLUDED.precision, matched_name = EXCLUDED.matched_name, address = EXCLUDED.address, looked_up_at = now()`,
      [station, rawState, row.lat, row.lon, row.method, row.precision, row.matched_name, row.address]);
  }
  return rows.length;
}

// Background: keep going a batch a minute while there's anything to find.
export function startStationLocator(loadGraph) {
  const round = async () => {
    try {
      const { rows: [t] } = await pool.query("SELECT to_regclass('feeder') IS NOT NULL AS ok");
      if (t.ok) await locateSomeStations(await loadGraph());
    } catch (e) { console.error("feeder station locator:", e.message); }
  };
  setTimeout(round, 5_000);
  setInterval(round, ROUND_MS);
}
