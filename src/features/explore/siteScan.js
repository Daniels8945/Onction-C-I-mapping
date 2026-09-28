// Site Intelligence Scanner — everything the Explore scan knows about a point,
// gathered from several sources of very different certainty. Each section of
// the result carries a `source` so the card can badge it honestly:
//   live      — computed now by the Onction grid API
//   snapshot  — a frozen real reading (see data/feederSnapshot.js)
//   onction   — Onction's own deal data
//   estimate  — a rule of thumb, not a measurement
//
// Pure functions + fetches only; the map drawing lives in useSiteScan.js.

import * as turf from "@turf/turf";
import { gridApi } from "@/lib/gridApi";
import { CI_CUSTOMERS } from "@/data";
import { FEEDER_SNAPSHOT } from "@/data/feederSnapshot";

// Which DisCo serves each state. State-level only: DisCo boundaries follow
// feeders, not state lines, so border areas can differ.
const STATE_DISCOS = {
  "federal capital territory": ["AEDC"], "fct": ["AEDC"], "abuja": ["AEDC"],
  "kogi": ["AEDC"], "niger": ["AEDC"], "nasarawa": ["AEDC"],
  "edo": ["BEDC"], "delta": ["BEDC"], "ondo": ["BEDC"], "ekiti": ["BEDC"],
  "lagos": ["EKEDC", "IKEDC"],
  "enugu": ["EEDC"], "anambra": ["EEDC"], "imo": ["EEDC"], "ebonyi": ["EEDC"], "abia": ["EEDC", "APL"],
  "oyo": ["IBEDC"], "ogun": ["IBEDC"], "osun": ["IBEDC"], "kwara": ["IBEDC"],
  "plateau": ["JEDC"], "benue": ["JEDC"], "bauchi": ["JEDC"], "gombe": ["JEDC"],
  "kaduna": ["KAEDCO"], "kebbi": ["KAEDCO"], "sokoto": ["KAEDCO"], "zamfara": ["KAEDCO"],
  "kano": ["KEDCO"], "katsina": ["KEDCO"], "jigawa": ["KEDCO"],
  "rivers": ["PHEDC"], "bayelsa": ["PHEDC"], "akwa ibom": ["PHEDC"], "cross river": ["PHEDC"],
  "adamawa": ["YEDC"], "borno": ["YEDC"], "yobe": ["YEDC"], "taraba": ["YEDC"],
};
const SPLIT_NOTES = {
  lagos: "Lagos is split between Eko (south) and Ikeja (north) DisCos.",
  abia: "Aba and its environs are served by APL (Aba Power); the rest of Abia by EEDC.",
};

export function discosForState(state) {
  const key = String(state || "").toLowerCase().replace(/\s+state$/, "").trim();
  return { ids: STATE_DISCOS[key] || [], note: SPLIT_NOTES[key] || null };
}

// Rough annual PV yield by latitude — Nigeria runs from ~1,300 kWh/kWp/yr on
// the humid coast to ~1,750 in the Sahel north. A placeholder until PVGIS /
// NASA POWER is wired in; always shown as an estimate.
export function solarYieldEstimate(lat) {
  const t = Math.min(1, Math.max(0, (lat - 4.3) / (13.9 - 4.3)));
  return Math.round((1300 + t * 450) / 10) * 10;
}

export async function reverseGeocode(lat, lng, signal) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`;
  const r = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Geocoder ${r.status}`);
  const d = await r.json();
  const a = d.address || {};
  const place = a.suburb || a.town || a.city_district || a.city || a.village || a.county || d.name || null;
  const area = a.city || a.town || a.county || null;
  return {
    place: place && area && place !== area ? `${place}, ${area}` : place || area,
    state: a.state || null,
    country: a.country_code || null,
  };
}

// How available a GenCo's capacity is, from the free-text `commitment` field.
export function availabilityOf(commitment) {
  const c = String(commitment || "").toLowerCase();
  if (c === "free") return { key: "available", label: "Available" };
  if (c.includes("over")) return { key: "over", label: "Over-committed" };
  if (c.includes("earmark")) return { key: "earmarked", label: "Earmarked" };
  if (c.includes("commit")) return { key: "committed", label: "Committed" };
  return { key: "unknown", label: "No data" };
}

// GenCo tariff grossed up for transmission losses: what a delivered kWh of
// energy costs before TCN / DisCo wheeling charges (not modelled yet).
export function indicativeNgnKwh(tariff, lossPct) {
  if (tariff == null || lossPct == null || lossPct >= 100) return null;
  return tariff / (1 - lossPct / 100);
}

const AVAIL_RANK = { available: 0, earmarked: 1, committed: 2, over: 3, unknown: 4 };

// Available capacity first, then cheapest delivered energy, then shortest.
export function rankSources(results) {
  return results
    .map(r => ({ ...r, availability: availabilityOf(r.commitment), indicativeNgnKwh: indicativeNgnKwh(r.tariff_ngn_kwh, r.loss_pct) }))
    .sort((a, b) =>
      AVAIL_RANK[a.availability.key] - AVAIL_RANK[b.availability.key] ||
      (a.indicativeNgnKwh ?? Infinity) - (b.indicativeNgnKwh ?? Infinity) ||
      a.total_km - b.total_km);
}

export function nearbyDemand(lat, lng, offtakers, radiusKm = 30) {
  const here = turf.point([lng, lat]);
  const within = (x, y) => turf.distance(here, turf.point([x, y]), { units: "kilometers" }) <= radiusKm;
  const offs = (offtakers || []).filter(o => o.lat != null && within(o.lon, o.lat));
  const ci = CI_CUSTOMERS.filter(c => within(c.lng, c.lat));
  return {
    radiusKm,
    offtakers: offs.map(o => o.name),
    offtakerMw: offs.reduce((a, o) => a + (o.capacity_mw || 0), 0),
    ciCount: ci.length,
    ciNames: ci.slice(0, 4).map(c => c.name),
  };
}

// Nearest built substation of any kind. When it's much closer than the
// nearest injection point (e.g. a site beside Jebba 330 kV), the card says so
// — otherwise "far from the grid" reads as wrong to anyone who knows the area.
export function nearestBuiltSubstation(lat, lng, substations) {
  const here = turf.point([lng, lat]);
  let best = null;
  for (const s of substations || []) {
    if (s.status !== "existing") continue;
    const km = turf.distance(here, turf.point([s.lon, s.lat]), { units: "kilometers" });
    if (!best || km < best.km) best = { name: s.name, kv: s.voltage_kv, injection: s.is_injection, km: Math.round(km * 10) / 10 };
  }
  return best;
}

export function discoSupply(ids) {
  return ids
    .map(id => ({ id, ...FEEDER_SNAPSHOT.discos[id] }))
    .filter(d => d.feeders)
    .map(d => ({
      ...d,
      onlinePct: Math.round((100 * d.online) / d.feeders),
      availabilityPct: Math.round((100 * d.avgUptimeH) / FEEDER_SNAPSHOT.hoursElapsed),
    }));
}

// Runs every lookup for a point in parallel, reporting each section as it
// lands via onUpdate(partial) so the card fills in progressively.
export async function runSiteScan({ lat, lng, offtakers, substations, signal, onUpdate }) {
  const result = {
    lat, lng,
    solar: { source: "estimate", kwhPerKwp: solarYieldEstimate(lat) },
    demand: { source: "onction", ...nearbyDemand(lat, lng, offtakers) },
    location: { status: "loading" },
    sources: { status: "loading" },
    supply: { status: "loading" },
  };
  onUpdate({ ...result });

  const location = reverseGeocode(lat, lng, signal)
    .then(loc => {
      const { ids, note } = discosForState(loc.state);
      result.location = { status: "ready", ...loc };
      result.supply = ids.length
        ? { status: "ready", source: "snapshot", discoIds: ids, note, discos: discoSupply(ids) }
        : { status: "empty", message: loc.country && loc.country !== "ng" ? "Outside Nigeria" : "DisCo not identified for this point" };
    })
    .catch(err => {
      if (signal?.aborted) return;
      result.location = { status: "error", message: err.message };
      result.supply = { status: "error", message: "Needs the location lookup" };
    })
    .finally(() => { if (!signal?.aborted) onUpdate({ ...result }); });

  const sources = gridApi.bestSource({ lat, lng })
    .then(({ results }) => {
      const ranked = rankSources(results);
      const best = ranked[0];
      result.sources = {
        status: ranked.length ? "ready" : "empty", source: "live",
        ranked, top: ranked.slice(0, 3), total: ranked.length,
        injectionNode: best?.injection_node, lastMileKm: best?.last_mile_km,
        lastMileRoad: !!best?.last_mile_geometry, lastMileGeometry: best?.last_mile_geometry || null,
        nearestBuilt: nearestBuiltSubstation(lat, lng, substations),
      };
    })
    .catch(err => {
      if (signal?.aborted) return;
      result.sources = { status: "error", message: `Grid API unreachable (${err.message})` };
    })
    .finally(() => { if (!signal?.aborted) onUpdate({ ...result }); });

  await Promise.allSettled([location, sources]);
  return result;
}

// Plain-text summary for "Copy summary" — something a C&I manager can paste
// straight into an email or chat.
export function scanSummaryText(scan) {
  const lines = [];
  const where = scan.location?.place ? `${scan.location.place}${scan.location.state ? `, ${scan.location.state}` : ""}` : "Selected site";
  lines.push(`Onction site scan — ${where} (${scan.lat.toFixed(4)}°N, ${scan.lng.toFixed(4)}°E)`);
  const s = scan.sources;
  if (s?.status === "ready") {
    lines.push(`Grid connection: ${s.injectionNode}, last mile ${s.lastMileKm} km${s.lastMileRoad ? " by road" : " straight-line"}`);
    lines.push("Best grid sources:");
    s.top.forEach((r, i) => lines.push(
      `  ${i + 1}. ${r.genco} — ${r.availability.label}, ${r.total_km} km, ${r.loss_pct}% loss` +
      (r.indicativeNgnKwh ? `, ~₦${r.indicativeNgnKwh.toFixed(1)}/kWh energy + losses` : "")));
  }
  if (scan.supply?.status === "ready") {
    scan.supply.discos.forEach(d => lines.push(
      `${d.id} supply (snapshot ${FEEDER_SNAPSHOT.capturedAt}): ${d.online}/${d.feeders} feeders online, ~${d.availabilityPct}% availability today`));
  }
  lines.push(`Solar resource (estimate): ~${scan.solar.kwhPerKwp} kWh/kWp/yr`);
  if (scan.demand) lines.push(`Within ${scan.demand.radiusKm} km: ${scan.demand.offtakers.length} Onction offtakers (${scan.demand.offtakerMw} MW), ${scan.demand.ciCount} C&I anchor loads`);
  return lines.join("\n");
}
