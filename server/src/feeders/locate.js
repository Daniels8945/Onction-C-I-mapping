// Where each feeder is. The feeder-compliance API gives no coordinates —
// only the station a feeder hangs off ("ADEKUNLE FAJUYI ISS", "AJAH TS") and
// its state. So feeders are placed AT THEIR STATION, found in this order:
//   network   the station is a substation in Onction's network data (same
//             state, same name)
//   google    Google Places finds the station by name inside that state
//             ("site" when the result is an electrical facility; "area" when
//             Google only knows a place or street of that name — approximate)
//   none      not found; the feeder is listed but not drawn
//
// One physical station = ONE row (feeder_station). The feed often writes a
// station several ways — "ALAGBON TS" under "Lagos" and "Eko", "OTA TS" under
// "Lagos" (the DisCo's state) and "Ogun" (where it is) — so each (station,
// state) spelling the feed uses is an alias pointing at that one row
// (feeder_station_alias). Stations matched to the network data store no
// coordinates of their own: they point at the substation (matched_name) and
// take its position, so a substation correction moves them too.
// Lookups run once per station, a few at a time in the background.

import { pool } from "../db.js";
import { locate, normaliseStateName, stateBBox } from "../geo/admin.js";

const GOOGLE_KEY = (process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEYS || "").trim();
const BATCH = 20;              // stations looked up per round
const ROUND_MS = 60_000;       // one round a minute until all are done
const RETRY_NONE_DAYS = 14;    // look again for stations not found after this

export const DDL = `
CREATE TABLE IF NOT EXISTS feeder_station (
  id           serial PRIMARY KEY,
  name         text NOT NULL,           -- as the feed first wrote it
  name_key     text NOT NULL,           -- upper-case, single-spaced
  state        text,                    -- where the station is (normalised)
  lat          double precision,        -- NULL for network matches: see matched_name
  lon          double precision,
  method       text NOT NULL,           -- network | google | none
  precision    text,                    -- site | area (google only)
  matched_name text,                    -- network: the substation's name; google: the place's
  address      text,
  looked_up_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name_key, state)
);
CREATE TABLE IF NOT EXISTS feeder_station_alias (
  station    text NOT NULL,              -- exactly as the feed writes it
  state      text NOT NULL,
  station_id integer NOT NULL REFERENCES feeder_station (id) ON DELETE CASCADE,
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
export const nameKey = (raw) => String(raw || "").trim().replace(/\s+/g, " ").toUpperCase();
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
  const inState = substations.find(s => {
    if (s.state !== state || s.status !== "existing") return false;
    if (base(s.name) === want.join(" ")) return true;
    const have = tokens(s.name.replace(/\b\d+\s*kv\b/i, ""));
    // "AJAH TS" is the "Aja/Ajah" transmission station: every word of the
    // feed's name appears in ours (ours may carry a variant spelling too).
    return clean.kind === "transmission" && have.length && want.every(t => have.includes(t));
  });
  if (inState || clean.kind !== "transmission") return inState || null;
  // The feed sometimes lists a transmission station under its DisCo's state
  // ("OMOTOSHO TS" under Edo; Omotosho is in Ondo). Exact name, one match only.
  const anywhere = substations.filter(s => s.status === "existing" && base(s.name) === want.join(" "));
  return anywhere.length === 1 ? anywhere[0] : null;
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

const QUALITY = { network: 3, google: 2, none: 0 };
const better = (a, b) => (QUALITY[a.method] + (a.precision === "site" ? 0.5 : 0)) > (QUALITY[b.method] + (b.precision === "site" ? 0.5 : 0));
const kmBetween = (a, b) => {
  const r = (x) => (x * Math.PI) / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  return 2 * 6371 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2));
};

// Look a station up: network data first, then Google. Throws on a Google
// error so the caller can try again later.
async function lookUp(raw, state, substations) {
  const clean = cleanStation(raw);
  if (!state) return { method: "none" };
  const net = matchNetwork(clean, state, substations);
  // A network match can be in another state than the feed says; the station row takes its real state.
  if (net) return { method: "network", precision: "site", matched_name: net.name, lat: net.lat, lon: net.lon, ...(net.state && net.state !== state && { state: net.state }) };
  const g = await matchGoogle(clean, state);
  return g ? { method: "google", precision: g.precision, matched_name: g.name, address: g.address, lat: g.lat, lon: g.lon } : { method: "none" };
}

// Which station row a found location belongs to: an existing row with the
// same name in the same state, or — for transmission stations, which are
// named after their town — the same name anywhere it was found, or the same
// name within 2 km. Otherwise a new row.
async function stationFor(client, raw, state, found) {
  const key = nameKey(raw);
  const { rows: same } = await client.query(`
    SELECT s.*, COALESCE(s.lat, sub.lat::float) AS plat, COALESCE(s.lon, sub.lon::float) AS plon
    FROM feeder_station s LEFT JOIN substation sub ON s.method = 'network' AND sub.name = s.matched_name
    WHERE s.name_key = $1`, [key]);
  const transmission = cleanStation(raw).kind === "transmission";
  const located = same.filter(s => s.method !== "none");
  let target = null;
  if (found.method !== "none") {
    const here = { lat: found.lat, lon: found.lon };
    target = located.find(s => kmBetween(here, { lat: s.plat, lon: s.plon }) < 2)
      || (transmission && located[0])
      || same.find(s => s.state === state && s.method === "none")   // upgrade a not-found row
      || null;
  } else {
    target = (transmission && located[0]) || same.find(s => s.state === state) || null;
  }
  const store = (f) => [f.method === "network" ? null : f.lat ?? null, f.method === "network" ? null : f.lon ?? null,
    f.method, f.precision || null, f.matched_name || null, f.address || null];
  if (target) {
    if (found.method !== "none" && (target.method === "none" || better(found, target))) {
      await client.query(`UPDATE feeder_station SET lat=$2, lon=$3, method=$4, precision=$5, matched_name=$6, address=$7, looked_up_at=now(),
        state = $8 WHERE id = $1`, [target.id, ...store(found), state || target.state]);
    }
    return target.id;
  }
  const { rows: [ins] } = await client.query(`
    INSERT INTO feeder_station (name, name_key, state, lat, lon, method, precision, matched_name, address)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (name_key, state) DO UPDATE SET name_key = EXCLUDED.name_key RETURNING id`,
    [String(raw).trim(), key, state, ...store(found)]);
  return ins.id;
}

// One-time: the old one-row-per-spelling table (feeder_station_location)
// becomes stations + aliases, best result first, no new lookups.
async function migrateLegacy() {
  const { rows: [t] } = await pool.query("SELECT to_regclass('feeder_station_location') IS NOT NULL AS ok");
  if (!t.ok) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM feeder_station_location");
    rows.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
    for (const r of rows) {
      const found = r.method === "none" ? { method: "none" } : { method: r.method, precision: r.precision, matched_name: r.matched_name, address: r.address, lat: r.lat, lon: r.lon };
      const id = await stationFor(client, r.station, stateOf(r.state), found);
      await client.query("INSERT INTO feeder_station_alias (station, state, station_id) VALUES ($1,$2,$3) ON CONFLICT (station, state) DO UPDATE SET station_id = EXCLUDED.station_id", [r.station, r.state, id]);
    }
    await client.query("DROP TABLE feeder_station_location");
    await client.query("COMMIT");
    console.log(`feeder stations: ${rows.length} spellings migrated to one row per station`);
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

// Up to BATCH station spellings with no station yet, plus not-found stations
// due another look. Returns how many were handled.
export async function locateSomeStations(graph) {
  await pool.query(DDL);
  await migrateLegacy();
  const substations = [...graph.nodes.values()];
  const { rows: fresh } = await pool.query(`
    SELECT DISTINCT f.station, f.state FROM feeder f
    LEFT JOIN feeder_station_alias a ON a.station = f.station AND a.state = f.state
    WHERE f.station IS NOT NULL AND f.state IS NOT NULL AND a.station IS NULL LIMIT $1`, [BATCH]);
  for (const { station, state: rawState } of fresh) {
    const state = stateOf(rawState);
    let found;
    try { found = await lookUp(station, state, substations); }
    catch (e) { console.error(`feeder station lookup failed (${station}, ${rawState}): ${e.message}`); continue; }
    const client = await pool.connect();
    try {
      const id = await stationFor(client, station, found.state || state, found);
      await client.query("INSERT INTO feeder_station_alias (station, state, station_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [station, rawState, id]);
    } finally { client.release(); }
  }
  const { rows: stale } = await pool.query(`
    SELECT id, name, state FROM feeder_station WHERE method = 'none' AND looked_up_at < now() - make_interval(days => $1) LIMIT $2`,
    [RETRY_NONE_DAYS, Math.max(0, BATCH - fresh.length)]);
  for (const s of stale) {
    let found;
    try { found = await lookUp(s.name, s.state, substations); } catch { continue; }
    if (found.method === "none") { await pool.query("UPDATE feeder_station SET looked_up_at = now() WHERE id = $1", [s.id]); continue; }
    const client = await pool.connect();
    try {
      const id = await stationFor(client, s.name, found.state || s.state, found);
      if (id !== s.id) {   // it turned out to be a station we already have: fold this one into it
        await client.query("UPDATE feeder_station_alias SET station_id = $1 WHERE station_id = $2", [id, s.id]);
        await client.query("DELETE FROM feeder_station WHERE id = $1", [s.id]);
      }
    } finally { client.release(); }
  }
  return fresh.length + stale.length;
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
