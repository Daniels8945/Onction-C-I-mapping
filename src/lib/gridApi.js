const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `${res.status} ${res.statusText}`);
  return res.json();
}

export const gridApi = {
  substations: () => get("/api/substations"),
  gridEdges:   () => get("/api/grid-edges"),
  gencos:      () => get("/api/gencos"),
  discos:      () => get("/api/discos"),
  offtakers:   () => get("/api/offtakers"),
  lossModels:  () => get("/api/loss-models"),
  atccScenarios: () => get("/api/atcc-scenarios"),
  route: ({ genco, dest, lat, lng, lossModel, scenario, mw }) => {
    const p = new URLSearchParams({ genco });
    if (dest) p.set("dest", dest);
    if (lat != null) p.set("lat", lat);
    if (lng != null) p.set("lng", lng);
    if (lossModel) p.set("lossModel", lossModel);
    if (scenario) p.set("scenario", scenario);
    if (mw != null) p.set("mw", mw);
    return get(`/api/route?${p}`);
  },
  bestSource: ({ dest, lat, lng, lossModel, scenario, mw }) => {
    const p = new URLSearchParams();
    if (dest) p.set("dest", dest);
    if (lat != null) p.set("lat", lat);
    if (lng != null) p.set("lng", lng);
    if (lossModel) p.set("lossModel", lossModel);
    if (scenario) p.set("scenario", scenario);
    if (mw != null) p.set("mw", mw);
    return get(`/api/best-source?${p}`);
  },
};
