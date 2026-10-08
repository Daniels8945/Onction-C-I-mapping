// Customer / establishment search for the Connect workflow — "find ABC
// Manufacturing, Ogun State" — and reverse lookup for dropped pins.
//
// Sources, merged and de-duplicated:
//   google     Google Places Text Search (New) — only when GOOGLE_MAPS_API_KEY
//              is set on the server. Best coverage of Nigerian businesses.
//              Reverse lookups use the Google Geocoding API too, falling back
//              to Nominatim. Needs "Places API (New)" + "Geocoding API"
//              enabled on the key's Google Cloud project.
//   osm        Photon (fuzzy, OpenStreetMap) + Nominatim (OpenStreetMap).
//              Free; good for towns, streets and well-mapped sites, patchy for
//              industrial estates and many businesses.
// Every result gets an honest confidence: how well its name matches the
// query, and how precise the point is (a site vs a street vs a town centre).
// A state named in the query ("…, Ogun State") filters/demotes elsewhere.
//
// Calls happen server-side (keys stay here; Nominatim's 1 request/second
// policy is enforced in one place) and results are cached.

import { locate, stateInText, stateBBox, STATE_NAMES } from "./admin.js";

// GOOGLE_MAPS_API_KEYS (plural) is accepted too — an easy slip in .env.
const GOOGLE_KEY = (process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEYS || "").trim();
const USER_AGENT = `OnctionGridAtlas/1.0 (${process.env.GEOCODER_CONTACT || "https://onctionenergy.com"})`;
const NG_BBOX = [2.6, 4.2, 14.7, 13.9]; // minLng, minLat, maxLng, maxLat
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 3600_000;
const CACHE_MAX = 2000;

export const geocoderSources = () => ({ google: !!GOOGLE_KEY, osm: true });

// ── small LRU cache ──────────────────────────────────────────────────────
const cache = new Map();
function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) { cache.delete(key); cache.set(key, hit); return hit.value; }
  const value = fn().catch(e => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return value;
}

// Nominatim allows at most one request per second per application.
let nominatimChain = Promise.resolve();
function nominatimFetch(url) {
  const run = nominatimChain.then(async () => {
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error(`Nominatim ${r.status}`);
    return r.json();
  });
  nominatimChain = run.catch(() => {}).then(() => new Promise(res => setTimeout(res, 1100)));
  return run;
}

// ── scoring ──────────────────────────────────────────────────────────────
const STOP = new Set(["ltd", "limited", "plc", "nig", "nigeria", "the", "of", "and", "state", "road", "rd", "street", "st", "co", "company", "inc", "&"]);
const STATE_WORDS = new Set(STATE_NAMES.flatMap(n => n.toLowerCase().split(/\s+/)).concat(["fct", "abuja", "federal", "capital", "territory"]));
const words = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

// Words that describe a kind of place rather than name one. A result has to
// match at least one word that ISN'T in here — "Agbara Industrial Estate"
// must match "Agbara", not just "industrial".
const GENERIC = new Set(["industrial", "industry", "industries", "estate", "estates", "park", "zone", "area", "plant", "factory",
  "mill", "mills", "manufacturing", "manufacturers", "products", "foods", "food", "cement", "steel", "group", "international",
  "global", "services", "enterprises", "enterprise", "hospital", "clinic", "school", "university", "market", "plaza", "mall",
  "office", "head", "hq", "branch", "site", "facility", "layout", "phase", "new", "old", "north", "south", "east", "west",
  "central", "main", "power", "energy", "station", "gas", "oil", "farm", "farms", "city", "town", "village", "junction",
  "hotel", "hotels", "lodge", "resort", "guest", "house", "suites", "bank", "church", "mosque", "warehouse", "depot", "refinery",
  "quarry", "mine", "mining", "brewery", "bakery", "plantation", "poultry", "pharmacy", "pharmaceutical", "pharmaceuticals",
  "supermarket", "shopping", "centre", "center", "store", "stores", "shop", "company", "firm", "manufacturer", "textile",
  "textiles", "plastics", "plastic", "paper", "beverage", "beverages", "bottling", "flour", "rice", "sugar", "packaging",
  "chemicals", "chemical", "processing", "industrial", "complex", "terminal", "port", "airport", "medical", "teaching",
  "college", "polytechnic", "academy", "barracks", "prison", "stadium", "garden", "gardens"]);

// Joining words in informal queries — "factory close to Sagamu", "hotel in
// Kano". They're never part of the name; the words after one say WHERE.
const FILLER = new Set(["in", "near", "nearby", "close", "to", "around", "by", "at", "beside", "off", "along", "opposite",
  "behind", "within", "inside", "from", "for", "a", "an", "around", "located", "somewhere"]);
const SPATIAL = /\b(?:in|near|nearby|close\s+to|around|beside|off|along|opposite|behind|within|inside|at)\b/;

const nameTokensOf = (text) => words(text).filter(w => !STOP.has(w) && !STATE_WORDS.has(w) && !FILLER.has(w) && w.length > 1);

// What the query asks for. `descriptive`: every naming word is a kind of
// place ("cement factory in Ogun", "hotel Kano") — a search for a category,
// not a named business, so results can't be judged by name overlap.
function parseQuery(query) {
  const q = String(query).toLowerCase();
  const m = q.match(SPATIAL);
  const what = nameTokensOf(m ? q.slice(0, m.index) : q);
  const where = m ? nameTokensOf(q.slice(m.index + m[0].length)) : [];
  const tokens = nameTokensOf(q);
  const descriptive = what.length > 0 && what.every(t => GENERIC.has(t));
  return { tokens, what, where, descriptive };
}

// Levenshtein distance, early-exit above `max`.
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// The words a result can be matched against: its own words plus each
// adjacent pair run together ("Kiri Kasamma" ↔ "Kirikasamma").
function hay(...texts) {
  const ws = texts.flatMap(t => words(t));
  return new Set([...ws, ...ws.slice(1).map((w, i) => ws[i] + w)]);
}

// Does query word `t` appear in `h`: exactly, as a prefix ("manufac…"), or
// within a typo or two ("cemnt" ↔ "cement", "Sagamu" ↔ "Shagamu").
function tokMatch(t, h) {
  if (h.has(t)) return true;
  const max = t.length >= 9 ? 2 : t.length >= 5 ? 1 : 0;
  for (const w of h) {
    if (t.length >= 4 && w.startsWith(t)) return true;
    if (max && w.length >= 5 && lev(t, w, max) <= max) return true;
  }
  return false;
}

// A readable kind of place for OpenStreetMap results ("tourism=hotel" → "Hotel").
const OSM_LABEL = { "landuse=industrial": "Industrial area", "landuse=residential": "Residential area", "landuse=commercial": "Commercial area",
  "landuse=farmland": "Farmland", "boundary=administrative": "Administrative area", "power=substation": "Substation", "power=plant": "Power plant" };
function osmTypeLabel(category) {
  if (OSM_LABEL[category]) return OSM_LABEL[category];
  const [k, v] = String(category).split("=");
  const t = (!v || v === "yes" ? k : v).replace(/_/g, " ");
  return k === "highway" ? "Road" : t.charAt(0).toUpperCase() + t.slice(1);
}

// precision: "site" (a facility / building / POI), "address" (street / house
// number), "area" (settlement / district centre — approximate for a site).
const AREA_TYPES = new Set(["city", "town", "village", "hamlet", "suburb", "neighbourhood", "quarter", "county", "district", "state", "locality", "region", "administrative", "residential", "isolated_dwelling", "political", "sublocality", "postal_code"]);
const ADDRESS_TYPES = new Set(["house", "street", "road", "primary", "secondary", "tertiary", "trunk", "residential_road", "route", "street_address", "premise", "highway", "bus_stop"]);
// OpenStreetMap categories that are a facility / building a customer could
// occupy, vs natural features (rivers, hills…) which never are.
const SITE_KEYS = new Set(["building", "amenity", "shop", "office", "landuse", "man_made", "power", "craft", "tourism", "leisure",
  "industrial", "healthcare", "aeroway", "club", "historic", "military", "emergency", "public_transport"]);
const FEATURE_KEYS = new Set(["waterway", "natural", "water", "geological", "mountain_pass"]);
function osmPrecision(key, value, fallbackType) {
  if (key === "place" || key === "boundary") return "area";
  if (key === "highway") return "address";
  if (FEATURE_KEYS.has(key)) return "feature";
  if (SITE_KEYS.has(key)) return "site";
  if (key === "railway") return value === "station" || value === "halt" ? "site" : "feature";
  return precisionOf(fallbackType || value);
}

function precisionOf(type) {
  if (!type) return "area";
  if (AREA_TYPES.has(type)) return "area";
  if (ADDRESS_TYPES.has(type)) return "address";
  return "site";
}

function scoreResult(r, parsed, stateHint) {
  const { tokens } = parsed;
  const stateOk = !stateHint || r.state === stateHint;
  if (parsed.descriptive) return scoreDescriptive(r, parsed, stateHint, stateOk);
  const hayName = hay(r.name);
  const hayAll = hay(r.name, r.address, r.lga);
  const distinctive = tokens.filter(t => !GENERIC.has(t));
  const matchesDistinctive = !distinctive.length || distinctive.some(t => tokMatch(t, hayAll));
  const exactName = words(r.name).filter(w => !STOP.has(w)).join(" ") === tokens.join(" ");
  const inName = tokens.filter(t => tokMatch(t, hayName)).length;
  const inAll = tokens.filter(t => tokMatch(t, hayAll)).length;
  const coverage = tokens.length ? Math.max(inName, inAll * 0.8) / tokens.length : 1;

  let confidence = "low", reason;
  if (!stateOk) reason = `In ${r.state || "another state"}, not ${stateHint}`;
  else if (r.precision === "feature") reason = "A natural feature, not a site";
  else if (coverage >= 0.8 && r.precision === "site") { confidence = "high"; reason = "Name matches a mapped site"; }
  else if (coverage >= 0.8 && r.precision === "address") { confidence = "medium"; reason = "Street-level match — confirm the exact site"; }
  else if (coverage >= 0.8) { confidence = "medium"; reason = "Area match — the pin is the area's centre, drag it to the site"; }
  else if (coverage >= 0.5) reason = "Partial name match — check it's the right place";
  else reason = "Weak match";
  if (r.source === "google" && confidence === "low" && stateOk && coverage >= 0.5) confidence = "medium";
  return { ...r, confidence, confidence_reason: reason, match: matchesDistinctive ? Math.round(coverage * 100) / 100 : 0, state_ok: stateOk, exact_name: exactName };
}

// "cement factory in Ogun": Google already understands the description, so
// its results stand if they're in the right place; an OpenStreetMap result
// must also BE that kind of place (by name or category). Never "high" —
// the user still has to recognise their customer among them.
function scoreDescriptive(r, { what, where }, stateHint, stateOk) {
  const placeHay = hay(r.address, r.lga, r.state, r.name);
  const whereOk = where.every(t => tokMatch(t, placeHay));
  const whatOk = r.source === "google" || what.some(t => tokMatch(t, hay(r.name, r.category.replace(/[=_]/g, " "))));
  const ok = stateOk && whereOk && whatOk && r.precision !== "feature";
  const near = where.length ? ` near ${where.map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}` : stateHint ? ` in ${stateHint}` : "";
  return {
    ...r, confidence: ok ? "medium" : "low", state_ok: stateOk, exact_name: false, match: ok ? 0.6 : 0,
    confidence_reason: ok ? `Matches "${what.join(" ")}"${near} — check it's your customer` : !stateOk ? `In ${r.state || "another state"}, not ${stateHint}` : "Doesn't match the description",
  };
}

// ── providers ────────────────────────────────────────────────────────────
function withAdmin(r) {
  const { state, lga, inNigeria } = locate(r.lat, r.lng);
  return inNigeria ? { ...r, state, lga } : null;
}

async function photon(query, stateHint) {
  const p = new URLSearchParams({ q: query, limit: "8", lang: "en", bbox: NG_BBOX.join(",") });
  const bb = stateHint && stateBBox(stateHint);
  if (bb) { p.set("lat", String((bb[1] + bb[3]) / 2)); p.set("lon", String((bb[0] + bb[2]) / 2)); }
  const r = await fetch(`https://photon.komoot.io/api/?${p}`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`Photon ${r.status}`);
  const d = await r.json();
  return d.features.map(f => {
    const pr = f.properties, [lng, lat] = f.geometry.coordinates;
    const address = [pr.housenumber && pr.street ? `${pr.housenumber} ${pr.street}` : pr.street, pr.district || pr.locality, pr.city || pr.county, pr.state].filter(Boolean).join(", ");
    return { source: "osm", provider: "photon", id: `osm:${pr.osm_type}${pr.osm_id}`, name: pr.name || pr.street || address, address, lat, lng,
      category: `${pr.osm_key}=${pr.osm_value}`, type_label: osmTypeLabel(`${pr.osm_key}=${pr.osm_value}`),
      precision: pr.type === "house" ? "address" : osmPrecision(pr.osm_key, pr.osm_value) };
  });
}

async function nominatim(query, stateHint) {
  const p = new URLSearchParams({ q: query, countrycodes: "ng", format: "jsonv2", limit: "8", addressdetails: "1" });
  const bb = stateHint && stateBBox(stateHint);
  if (bb) { p.set("viewbox", bb.join(",")); p.set("bounded", "0"); }
  const d = await nominatimFetch(`https://nominatim.openstreetmap.org/search?${p}`);
  return d.map(x => {
    const a = x.address || {};
    const address = [a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road, a.suburb || a.village, a.city || a.town || a.county, a.state].filter(Boolean).join(", ");
    return { source: "osm", provider: "nominatim", id: `osm:${x.osm_type?.[0] || ""}${x.osm_id}`, name: x.name || address || x.display_name.split(",")[0],
      address, lat: Number(x.lat), lng: Number(x.lon), category: `${x.category}=${x.type}`, type_label: osmTypeLabel(`${x.category}=${x.type}`),
      importance: Number(x.importance) || 0,
      precision: osmPrecision(x.category, x.type, x.addresstype) };
  });
}

// Google's error bodies say what's wrong ("API not enabled", "key
// restricted…") — surface that rather than a bare status code.
async function googleError(r, what) {
  let msg = "";
  try { const d = await r.json(); msg = d.error?.message || d.error_message || ""; } catch {}
  return new Error(`${what} ${r.status}${msg ? ` — ${msg.slice(0, 160)}` : ""}`);
}

const GOOGLE_TYPE_LABEL = { locality: "Town", sublocality: "District", neighborhood: "Neighbourhood", route: "Street",
  street_address: "Street address", premise: "Building", administrative_area_level_1: "State", administrative_area_level_2: "LGA",
  establishment: "Place", point_of_interest: "Place" };
const googleTypeLabel = (types) => GOOGLE_TYPE_LABEL[types.find(t => GOOGLE_TYPE_LABEL[t])] || null;

// Google Places API (New) Text Search, restricted to Nigeria.
async function google(query, stateHint) {
  const bb = (stateHint && stateBBox(stateHint)) || NG_BBOX;
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.primaryTypeDisplayName,places.businessStatus",
    },
    body: JSON.stringify({
      textQuery: query, regionCode: "NG", maxResultCount: 8,
      locationBias: { rectangle: { low: { latitude: bb[1], longitude: bb[0] }, high: { latitude: bb[3], longitude: bb[2] } } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw await googleError(r, "Google Places");
  const d = await r.json();
  return (d.places || []).filter(p => p.businessStatus !== "CLOSED_PERMANENTLY").map((p, i) => ({
    source: "google", provider: "google", id: `google:${p.id}`, g_rank: i,
    type_label: p.primaryTypeDisplayName?.text || googleTypeLabel(p.types || []), name: p.displayName?.text || p.formattedAddress, address: p.formattedAddress || "",
    lat: p.location.latitude, lng: p.location.longitude, category: p.primaryType || p.types?.[0] || "",
    precision: (p.types || []).some(t => AREA_TYPES.has(t) || t.startsWith("administrative_area") || t === "locality") ? "area"
      : (p.types || []).some(t => ADDRESS_TYPES.has(t)) ? "address" : "site",
  }));
}

// "6.4521, 3.3958" or "6.4521 3.3958" → a direct coordinate result.
function parseCoords(q) {
  const m = String(q).trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const distM = (a, b) => {
  const dx = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180), dy = (a.lat - b.lat) * 110540;
  return Math.hypot(dx, dy);
};

export async function searchPlaces(query, { limit = 8 } = {}) {
  const q = String(query || "").trim().slice(0, 200);
  if (q.length < 2) return { query: q, state_hint: null, results: [], sources: geocoderSources(), errors: [] };

  const coords = parseCoords(q);
  if (coords) {
    const r = withAdmin({ source: "coordinates", provider: "input", id: `pt:${coords.lat},${coords.lng}`, name: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
      address: "", ...coords, category: "coordinates", precision: "site" });
    return { query: q, state_hint: null, sources: geocoderSources(), errors: [],
      results: r ? [{ ...r, confidence: "high", confidence_reason: "Exact coordinates", match: 1, state_ok: true }] : [] };
  }

  return cached(`s:${q.toLowerCase()}`, async () => {
    const stateHint = stateInText(q);
    const parsed = parseQuery(q);
    const errors = [];
    let results = await gather(q, parsed, stateHint, errors, { nominatim: true });

    // Incomplete address ("Ikeja Industrial Area"): nothing confident for the
    // whole phrase → look up its distinctive part ("Ikeja") and offer that
    // area to start from, saying so. Never for descriptions or one-worders.
    let fallback = null;
    const distinctive = parsed.tokens.filter(t => !GENERIC.has(t));
    if (!parsed.descriptive && distinctive.length && distinctive.length < parsed.tokens.length
        && !results.some(r => r.confidence !== "low")) {
      const fq = [distinctive.join(" "), stateHint].filter(Boolean).join(", ");
      const more = (await gather(fq, parseQuery(fq), stateHint, errors, { nominatim: false }))
        // Only the area itself (the town, the district) — a mall or barracks
        // that happens to share the name isn't a place to start from.
        .filter(r => r.confidence !== "low" && r.precision === "area" && !results.some(o => o.id === r.id))
        .map(r => ({ ...r, fallback: true, confidence: "medium",
          confidence_reason: `"${q}" wasn't found as a site — this is ${r.name}; drag the pin to the exact site` }));
      if (more.length) { fallback = fq; results = [...more, ...results]; }
    }
    return { query: q, state_hint: stateHint, descriptive: parsed.descriptive, fallback_query: fallback,
      sources: geocoderSources(), errors, results: results.slice(0, limit) };
  });
}

// Every provider in parallel → Nigeria only, + state/LGA from our own
// boundaries, + confidence → de-duplicated and ranked.
async function gather(q, parsed, stateHint, errors, { nominatim: withNominatim }) {
  const providers = [
    ...(GOOGLE_KEY ? [["google", google(q, stateHint)]] : []),
    ["photon", photon(q, stateHint)],
    ...(withNominatim ? [["nominatim", nominatim(q, stateHint)]] : []),
  ];
  const settled = await Promise.allSettled(providers.map(([, p]) => p));
  const raw = [];
  settled.forEach((s, i) => s.status === "fulfilled" ? raw.push(...s.value) : errors.push(`${providers[i][0]}: ${s.reason?.message || s.reason}`));

  const scored = raw.map(withAdmin).filter(Boolean).map(r => scoreResult(r, parsed, stateHint))
    .filter(r => r.match > 0 || parsed.tokens.length === 0);

  // De-duplicate (same place from two providers): keep the better one.
  // Confidence first; then Google, exact name, match, how prominent the
  // place is (Nominatim's importance), Google's own relevance order, and
  // site > address/area precision.
  const rank = (r) => ({ high: 3, medium: 2, low: 1 }[r.confidence] * 10 + (r.source === "google" ? 2 : 0) + r.match
    + (r.exact_name ? 1 : 0) + (r.importance || 0) * 2 + (r.g_rank != null ? 0.4 * (1 - r.g_rank / 8) : 0)
    + ({ site: 1, address: 0.5, area: 0.5, feature: 0 }[r.precision] ?? 0));
  scored.sort((a, b) => rank(b) - rank(a));
  const out = [];
  for (const r of scored) {
    if (out.some(o => distM(o, r) < 250 && (words(o.name).join(" ") === words(r.name).join(" ") || distM(o, r) < 40))) continue;
    out.push(r);
  }
  // Results in the named state first; elsewhere ones stay, flagged, below.
  out.sort((a, b) => (b.state_ok - a.state_ok) || rank(b) - rank(a));
  return out;
}

// A dropped / dragged pin → nearest address (Google when configured, else
// Nominatim) + our state / LGA.
export async function reversePlace(lat, lng) {
  const admin = locate(lat, lng);
  const key = `r:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const addr = await cached(key, async () => {
    if (GOOGLE_KEY) {
      const g = await googleReverse(lat, lng).catch(e => { console.warn(`[geocode] ${e.message}`); return null; });
      if (g?.name || g?.address) return g;
    }
    const d = await nominatimFetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=17&addressdetails=1`);
    const a = d.address || {};
    return {
      name: d.name || a.road || a.suburb || a.village || a.town || a.city || null,
      address: [a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road, a.suburb || a.village, a.city || a.town || a.county].filter(Boolean).join(", "),
    };
  }).catch(() => ({ name: null, address: "" }));
  return { lat, lng, ...admin, ...addr };
}
