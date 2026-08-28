import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { DISCOS, GENCOS, TRADERS, TRANSMISSION, CI_CUSTOMERS, getZoneForState } from "../data";
import { computeBuffer, measureDistance, findNearestGenco } from "../utils/analysis";
import { gridApi } from "../lib/gridApi";

const C = {
  accent: "#f5a623", green: "#00e5a0", red: "#e05252",
  purple: "#7c6af8", cyan: "#22d3ee", orange: "#fb923c",
};

export const LAYER_GROUPS = {
  ci:           ["ci-circle", "ci-glow", "ci-labels"],
  // states: ["states-fill", "states-outline", "states-hover", "states-labels"],  // commented out
  // zones:  ["states-zone-fill"],  // commented out — not shown in UI
  discos:       ["discos-circle", "discos-glow", "discos-labels"],
  gencos:       ["gencos-circle", "gencos-glow", "gencos-labels"],
  traders:      ["traders-circle", "traders-glow", "traders-labels"],
  transmission: ["transmission-lines", "transmission-glow"],
  buffers:      ["buffers-fill", "buffers-outline"],
  // ── Onction Grid Atlas (live from Postgres API) ──────────────────────
  gridSubstations: ["grid-sub-circle", "grid-sub-labels"],
  gridEdges:       ["grid-edge-lines"],
  gridGencos:      ["grid-genco-circle", "grid-genco-glow", "grid-genco-labels"],
  gridDiscos:      ["grid-disco-circle", "grid-disco-labels"],
  gridOfftakers:   ["grid-offtaker-circle", "grid-offtaker-glow", "grid-offtaker-labels"],
  gridRoute:       ["grid-route-trunk", "grid-route-lastmile", "grid-route-hops", "grid-route-dest"],
};

const INIT_VIS = {
  ci: true, states: false, zones: false,  // states hidden
  discos: false, gencos: true, traders: true,  // gencos + traders ON by default
  // transmission and buffers hidden — toggle via code only
  transmission: false, buffers: false,
  // GenCos + Offtakers ON by default — the sidebar's own hint text already tells
  // users to click these markers (nearest-offtaker/GenCo lookup, route calculator),
  // so they can't be opt-in only. Substations/edges/DisCos stay opt-in (dense, map-only).
  gridSubstations: false, gridEdges: false, gridGencos: true, gridDiscos: false, gridOfftakers: true,
  gridRoute: true, // visibility of this group tracks whether a route is computed, not a manual toggle
};

export default function useNigeriaMap({ isDark, BASEMAP } = {}) {
  const containerRef   = useRef(null);
  const mapRef         = useRef(null);
  const modeRef        = useRef("explore");
  const featureHandled = useRef(false);
  const lastClicked    = useRef(null);
  const measurePts     = useRef([]);
  const bufferFeatures = useRef([]);
  const measurePopups  = useRef([]);
  const pinMarkersRef  = useRef({});

  const [mapReady,  setMapReady]  = useState(false);
  const [coords,    setCoords]    = useState("");
  const [zoom,      setZoom]      = useState(6);
  const [mode,      setMode]      = useState("explore");
  const [layerVis,  setLayerVis]  = useState(INIT_VIS);
  const layerVisRef = useRef(INIT_VIS);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [analysisText,    setAnalysisText]    = useState("Select a tool in the toolbar to run spatial analysis.");
  const [bufferCount,     setBufferCount]     = useState(0);
  const [pins,      setPins]      = useState([]);

  // ── Onction Grid Atlas state (live API data) ─────────────────────────
  const gridNodesRef    = useRef(new Map()); // substation name -> {lat, lon}
  const gridPartiesRef  = useRef({ gencos: [], discos: [], offtakers: [] });
  const gridRouteTableRef = useRef([]); // the precomputed 182-row genco x destination table (/api/routes)
  const gridAtlasDataRef = useRef(null); // raw fetch response, cached so theme swaps don't re-hit the API
  const lastGridRouteRef = useRef(null); // { result, destCoords } — redrawn after each theme swap
  const listenersBoundRef = useRef(false); // click/hover handlers are delegated and must be bound only once
  const [gridStatus,   setGridStatus]   = useState("idle"); // idle | loading | ready | error
  const [gridError,    setGridError]    = useState(null);
  const [gridParties,  setGridParties]  = useState({ gencos: [], discos: [], offtakers: [] });
  const [gridLossModels,    setGridLossModels]    = useState([]);
  const [gridAtccScenarios, setGridAtccScenarios] = useState([]);
  const [gridRouteResult,   setGridRouteResult]   = useState(null);
  const [gridBestSource,    setGridBestSource]    = useState(null);
  // Clicking a GenCo/DisCo/Offtaker marker on the map preloads the Route & Loss Calculator —
  // the map and the calculator are otherwise two disconnected UIs with no obvious link.
  const [gridPresetGenco, setGridPresetGenco] = useState(null);
  const [gridPresetDest,  setGridPresetDest]  = useState(null);
  // Ranked "nearest offtakers" (clicked a GenCo) or "nearest GenCos" (clicked an
  // Offtaker), read straight off the precomputed route table — no extra API calls.
  const [gridNearby, setGridNearby] = useState(null); // { sourceKind: "GenCo"|"Offtaker", sourceName, items: [...] }

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { layerVisRef.current = layerVis; }, [layerVis]);

  // Adds every data source/layer this app owns (not the basemap itself).
  // Safe to call repeatedly: map.setStyle() wipes all sources/layers, so this
  // runs once on initial "load" and again after every theme swap's "style.load".
  function _addAllLayers(map) {
    // _addStatesLayer(map);   // commented out — state boundaries hidden for now
    // _addTransmissionLayer(map);  // commented out — not shown in UI
    _addDISCOLayer(map);
    _addGencoLayer(map);
    _addCILayer(map);
    _addTraderLayer(map);
    // _addBufferLayer(map);  // commented out — not shown in UI
    _addGridRouteLayers(map);
    _renderGridAtlas(map); // no-op until the API fetch resolves at least once
  }

  // Delegated click/hover listeners survive map.setStyle() on their own — binding
  // them again after every theme swap would stack duplicate handlers, so this
  // runs exactly once, right after the first "load".
  function _registerInteractionHandlers(map) {
    if (listenersBoundRef.current) return;
    listenersBoundRef.current = true;
    _bindDISCOHandlers(map);
    _bindGencoHandlers(map);
    _bindCIHandlers(map);
    _bindTraderHandlers(map);
    // _bindGridAtlasHandlers(map) is bound once its data first arrives, inside _fetchGridAtlas
  }

  // Redraws the currently active grid route on freshly (re)created route sources
  // — needed after every theme swap, since setStyle() wipes the old ones.
  function _redrawActiveGridRoute(map) {
    const active = lastGridRouteRef.current;
    if (!active) return;
    if (active.result?.isCustom && active.resolvedNodes) _drawCustomRoute(map, active.resolvedNodes);
    else _drawGridRoute(map, active.result, active.destCoords);
  }

  // Theme swap: MapLibre vector styles must be fully swapped via setStyle(),
  // which removes all sources/layers not part of the new style — so every data
  // layer is re-added (not re-fetched) once the new style finishes loading.
  useEffect(() => {
    function handleTheme(e) {
      const map = mapRef.current; if (!map) return;
      const url = e.detail.dark ? BASEMAP.dark : BASEMAP.light;
      const doSwap = () => {
        map.setStyle(url);
        // "style.load" is unreliable for a setStyle()-triggered reload in this MapLibre
        // version (never observed to fire here) — "idle" does fire reliably once the new
        // style (sources, sprite, glyphs) has actually settled, so that's what we wait on.
        map.once("idle", () => {
          if (mapRef.current !== map) return;
          _addAllLayers(map);
          _syncVisToMap(map, layerVisRef.current);
          _redrawActiveGridRoute(map);
        });
      };
      map.isStyleLoaded() ? doSwap() : map.once("idle", doSwap);
    }
    window.addEventListener("gis:theme", handleTheme);
    return () => window.removeEventListener("gis:theme", handleTheme);
  }, [BASEMAP]);

  // Map init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const styleUrl = (isDark ? BASEMAP?.dark : BASEMAP?.light) || "https://tiles.openfreemap.org/styles/positron";

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [8.0, 9.0], zoom: 6, minZoom: 4, maxZoom: 18,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.on("mousemove", e => setCoords(`${e.lngLat.lat.toFixed(5)}°N  ${e.lngLat.lng.toFixed(5)}°E`));
    map.on("zoom", () => setZoom(map.getZoom()));
    map.on("load", () => {
      // Defensive: ignore a "load" firing on a map instance that's no longer the current
      // one (e.g. React StrictMode's dev-only double-invoke of this effect).
      if (mapRef.current !== map) return;

      _addAllLayers(map);
      _registerInteractionHandlers(map);
      _fetchGridAtlas(map);

      // Apply initial visibility directly to the map — don't rely solely on useEffect
      _syncVisToMap(map, INIT_VIS);

      if (import.meta.env.DEV) window.__map = map;
      setMapReady(true);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; setMapReady(false); };
  }, []);

  // ── Layer builders ───────────────────────────────────────────

  function _addStatesLayer(map) {
    const PRIMARY = "https://raw.githubusercontent.com/wmgeolab/geoBoundaries/main/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1_simplified.geojson";
    const FALLBACK = "https://cdn.jsdelivr.net/gh/wmgeolab/geoBoundaries@main/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1_simplified.geojson";
    const fetchData = () =>
      fetch(PRIMARY, { signal: AbortSignal.timeout(10000) }).catch(() => fetch(FALLBACK));
    fetchData().then(r => r.json()).then(gj => {
      gj.features.forEach(f => {
        const name = f.properties.shapeName || f.properties.NAME_1 || "";
        const { zone, color } = getZoneForState(name);
        Object.assign(f.properties, { _stateName: name, _zone: zone, _zoneColor: color });
      });
      map.addSource("states-src", { type: "geojson", data: gj, generateId: true });
      map.addLayer({ id: "states-zone-fill", type: "fill", source: "states-src", paint: { "fill-color": ["get", "_zoneColor"], "fill-opacity": 0.55 } });
      map.addLayer({ id: "states-fill",      type: "fill", source: "states-src", paint: { "fill-color": ["get", "_zoneColor"], "fill-opacity": 0.18 } });
      map.addLayer({ id: "states-outline",   type: "line", source: "states-src", paint: { "line-color": "#6a8aaa", "line-width": 1, "line-opacity": 0.7 } });
      map.addLayer({ id: "states-hover",     type: "fill", source: "states-src", paint: { "fill-color": "#000", "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.04, 0] } });
      map.addLayer({ id: "states-labels",    type: "symbol", source: "states-src", minzoom: 5,
        layout: { "text-field": ["get", "_stateName"], "text-font": ["Noto Sans Regular"], "text-size": 9, "text-allow-overlap": false },
        paint: { "text-color": "#445566", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
      // Sync visibility after async creation using current state
      _syncVisToMap(map, layerVisRef.current);
      let hovId = null;
      map.on("mousemove", "states-fill", e => {
        map.getCanvas().style.cursor = "pointer";
        if (e.features.length) {
          if (hovId !== null) map.setFeatureState({ source: "states-src", id: hovId }, { hover: false });
          hovId = e.features[0].id;
          map.setFeatureState({ source: "states-src", id: hovId }, { hover: true });
        }
      });
      map.on("mouseleave", "states-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hovId !== null) map.setFeatureState({ source: "states-src", id: hovId }, { hover: false });
        hovId = null;
      });
      map.on("click", "states-fill", e => {
        if (modeRef.current !== "explore") return;
        const p = e.features[0].properties;
        setSelectedFeature({ name: p._stateName, type: `State — ${p._zone}`, rows: [["Zone", p._zone], ["Country", "Nigeria"]] });
      });
    }).catch(err => {
      console.warn("State boundaries failed:", err.message);
      setAnalysisText(`<span style="color:#e05252">State boundaries unavailable</span><br/><span style="opacity:.7">Check connection. Other layers unaffected.</span>`);
    });
  }

  function _addTransmissionLayer(map) {
    const features = TRANSMISSION.map(t => ({ type: "Feature", id: t.id, properties: { ...t }, geometry: { type: "LineString", coordinates: t.coords } }));
    map.addSource("transmission-src", { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer({ id: "transmission-glow",  type: "line", source: "transmission-src", paint: { "line-color": C.red, "line-width": 6, "line-opacity": 0.08 } });
    map.addLayer({ id: "transmission-lines", type: "line", source: "transmission-src", paint: { "line-color": C.red, "line-width": 1.5, "line-dasharray": [5, 3], "line-opacity": 0.7 } });
    map.on("click", "transmission-lines", e => {
      if (modeRef.current !== "explore") return;
      const p = e.features[0].properties;
      setSelectedFeature({ name: p.name, type: "Transmission Line", rows: [["Voltage", p.voltage]] });
    });
    map.on("mouseenter", "transmission-lines", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "transmission-lines", () => { map.getCanvas().style.cursor = ""; });
  }

  function _addDISCOLayer(map) {
    const features = DISCOS.map(d => ({ type: "Feature", id: d.id, properties: { ...d }, geometry: { type: "Point", coordinates: [d.lng, d.lat] } }));
    map.addSource("discos-src", { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer({ id: "discos-glow",   type: "circle", source: "discos-src", paint: { "circle-radius": 22, "circle-color": ["get", "color"], "circle-opacity": 0.1 } });
    map.addLayer({ id: "discos-circle", type: "circle", source: "discos-src", paint: { "circle-radius": 10, "circle-color": ["get", "color"], "circle-opacity": 0.9, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.4 } });
    map.addLayer({ id: "discos-labels", type: "symbol", source: "discos-src", layout: { "text-field": ["get", "id"], "text-font": ["Noto Sans Bold"], "text-size": 7, "text-offset": [0, 2], "text-anchor": "top" }, paint: { "text-color": "#334455", "text-halo-color": "#fff", "text-halo-width": 1.5 } });
  }

  // Delegated listeners persist across map.setStyle() calls, so every click/hover
  // handler below is registered exactly once (see _registerInteractionHandlers)
  // rather than re-bound each time layers are re-added after a theme swap.
  function _bindDISCOHandlers(map) {
    map.on("click", "discos-circle", e => {
      featureHandled.current = true;
      const p = e.features[0].properties; lastClicked.current = e.features[0];
      setSelectedFeature({ name: p.name, type: "Distribution Company (DISCO)", rows: [["ID", p.id], ["Coverage", p.states], ["Customers", p.customers], ["Capacity", p.capacity]] });
      if (modeRef.current === "buffer") { _handleBufferOnFeature(map, e.lngLat, p); return; }
      _showPopup(map, e.lngLat, p.name, "DISCO", [["Coverage", p.states], ["Capacity", p.capacity]]);
    });
    map.on("mouseenter", "discos-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "discos-circle", () => { map.getCanvas().style.cursor = ""; });
  }

  function _addGencoLayer(map) {
    const features = GENCOS.map(g => ({ type: "Feature", id: g.id, properties: { ...g }, geometry: { type: "Point", coordinates: [g.lng, g.lat] } }));
    map.addSource("gencos-src", { type: "geojson", data: { type: "FeatureCollection", features } });
    const gencoColor = ["case",
      ["==", ["get", "type"],    "Hydro"], C.green,
      ["==", ["get", "subtype"], "NIPP"],  C.orange,
      ["==", ["get", "subtype"], "IPP"],   C.cyan,
      C.cyan];
    map.addLayer({ id: "gencos-glow",   type: "circle", source: "gencos-src", paint: { "circle-radius": 18, "circle-color": gencoColor, "circle-opacity": 0.1 } });
    map.addLayer({ id: "gencos-circle", type: "circle", source: "gencos-src", paint: { "circle-radius": 7,  "circle-color": gencoColor, "circle-opacity": 0.9, "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
    map.addLayer({ id: "gencos-labels", type: "symbol", source: "gencos-src", layout: { "text-field": ["concat", ["get", "name"], " [", ["get", "subtype"], "]"], "text-font": ["Noto Sans Regular"], "text-size": 8, "text-offset": [0, 1.4], "text-anchor": "top", "text-allow-overlap": false }, paint: { "text-color": "#334455", "text-halo-color": "#fff", "text-halo-width": 1.5 } });
  }

  function _bindGencoHandlers(map) {
    map.on("click", "gencos-circle", e => {
      featureHandled.current = true;
      const p = e.features[0].properties; lastClicked.current = e.features[0];
      const rows = [["Type", `${p.type} / ${p.subtype}`]];
      if (p.capacity) rows.push(["Capacity", `${p.capacity} MW`]);
      if (p.fuel)     rows.push(["Fuel", p.fuel]);
      if (p.owner)    rows.push(["Owner", p.owner]);
      if (p.phone)    rows.push(["Phone", p.phone]);
      if (p.email)    rows.push(["Email", p.email]);
      setSelectedFeature({ name: p.name, type: `${p.subtype || p.type} — Power Generation`, rows });
      if (modeRef.current === "buffer") { _handleBufferOnFeature(map, e.lngLat, p); return; }
      _showPopup(map, e.lngLat, p.name, `${p.subtype || p.type}`, rows);
    });
    map.on("mouseenter", "gencos-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "gencos-circle", () => { map.getCanvas().style.cursor = ""; });
  }

  function _addCILayer(map) {
    const features = CI_CUSTOMERS.map(c => ({ type: "Feature", id: c.id, properties: { ...c }, geometry: { type: "Point", coordinates: [c.lng, c.lat] } }));
    map.addSource("ci-src", { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer({ id: "ci-glow",   type: "circle", source: "ci-src", paint: { "circle-radius": 16, "circle-color": C.purple, "circle-opacity": 0.12 } });
    map.addLayer({ id: "ci-circle", type: "circle", source: "ci-src", paint: { "circle-radius": 8,  "circle-color": C.purple, "circle-opacity": 0.9, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.4 } });
    map.addLayer({ id: "ci-labels", type: "symbol", source: "ci-src", minzoom: 9,
      layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 9, "text-offset": [0, 1.6], "text-anchor": "top", "text-allow-overlap": false },
      paint: { "text-color": "#334455", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
  }

  function _bindCIHandlers(map) {
    map.on("click", "ci-circle", e => {
      featureHandled.current = true;
      const p = e.features[0].properties; lastClicked.current = e.features[0];
      setSelectedFeature({ name: p.name, type: `C&I — ${p.sector}`, rows: [
        ["State", p.state], ["Sector", p.sector],
        ...(p.address && p.address !== "undefined" ? [["Address", p.address]] : []),
        ...(p.phone   && p.phone.length > 3        ? [["Phone",   p.phone]]   : []),
        ...(p.email   && p.email.includes("@")     ? [["Email",   p.email]]   : []),
      ]});
      if (modeRef.current === "buffer") { _handleBufferOnFeature(map, e.lngLat, p); return; }
      const addrRow  = p.address && p.address !== "undefined" ? `<div class="nga-popup-row"><span class="nga-popup-key">Address</span><span class="nga-popup-val" style="max-width:150px;word-wrap:break-word">${p.address}</span></div>` : "";
      const phoneRow = p.phone   && p.phone.length > 3        ? `<div class="nga-popup-row"><span class="nga-popup-key">Phone</span><span class="nga-popup-val">${p.phone}</span></div>` : "";
      const emailRow = p.email   && p.email.includes("@")     ? `<div class="nga-popup-row"><span class="nga-popup-key">Email</span><span class="nga-popup-val" style="word-break:break-all;max-width:150px">${p.email}</span></div>` : "";
      new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
        .setLngLat(e.lngLat)
        .setHTML(`<div class="nga-popup"><p class="nga-popup-title">${p.name}</p><p class="nga-popup-sub">C&amp;I — ${p.sector} · ${p.state}</p>${addrRow}${phoneRow}${emailRow}</div>`)
        .addTo(map);
    });
    map.on("mouseenter", "ci-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "ci-circle", () => { map.getCanvas().style.cursor = ""; });
  }


  function _addTraderLayer(map) {
    const features = TRADERS.map(t => ({ type: "Feature", id: t.id, properties: { ...t }, geometry: { type: "Point", coordinates: [t.lng, t.lat] } }));
    map.addSource("traders-src", { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer({ id: "traders-glow",   type: "circle", source: "traders-src", paint: { "circle-radius": 18, "circle-color": C.accent, "circle-opacity": 0.12 } });
    map.addLayer({ id: "traders-circle", type: "circle", source: "traders-src", paint: { "circle-radius": 9, "circle-color": C.accent, "circle-opacity": 0.95, "circle-stroke-color": "#fff", "circle-stroke-width": 2, "circle-stroke-opacity": 0.5 } });
    map.addLayer({ id: "traders-labels", type: "symbol", source: "traders-src", layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 9, "text-offset": [0, 1.6], "text-anchor": "top", "text-allow-overlap": false }, paint: { "text-color": "#334455", "text-halo-color": "#fff", "text-halo-width": 2 } });
  }

  function _bindTraderHandlers(map) {
    map.on("click", "traders-circle", e => {
      featureHandled.current = true;
      const p = e.features[0].properties; lastClicked.current = e.features[0];
      const rows = [["Address", p.address]];
      if (p.phone && p.phone.length > 3) rows.push(["Phone", p.phone]);
      if (p.email && p.email.includes("@")) rows.push(["Email", p.email]);
      setSelectedFeature({ name: p.name, type: "Licensed Electricity Trader", rows });
      if (modeRef.current === "buffer") { _handleBufferOnFeature(map, e.lngLat, p); return; }
      const addrRow  = p.address ? `<div class="nga-popup-row"><span class="nga-popup-key">Address</span><span class="nga-popup-val" style="max-width:150px;word-wrap:break-word">${p.address}</span></div>` : "";
      const phoneRow = p.phone && p.phone.length > 3 ? `<div class="nga-popup-row"><span class="nga-popup-key">Phone</span><span class="nga-popup-val">${p.phone}</span></div>` : "";
      const emailRow = p.email && p.email.includes("@") ? `<div class="nga-popup-row"><span class="nga-popup-key">Email</span><span class="nga-popup-val" style="word-break:break-all;max-width:150px">${p.email}</span></div>` : "";
      new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
        .setLngLat(e.lngLat)
        .setHTML(`<div class="nga-popup"><p class="nga-popup-title">${p.name}</p><p class="nga-popup-sub">Licensed Electricity Trader</p>${addrRow}${phoneRow}${emailRow}</div>`)
        .addTo(map);
    });
    map.on("mouseenter", "traders-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "traders-circle", () => { map.getCanvas().style.cursor = ""; });
  }

  // ── Onction Grid Atlas — live data from the Postgres routing API ────────
  const GRID_C = { sub: "#64748b", edge: "#475569", genco: "#10b981", disco: "#38bdf8", offtaker: "#f472b6", route: "#f5a623" };

  // Fetches once and caches in gridAtlasDataRef; safe to call _renderGridAtlas
  // again after every theme swap without hitting the network again.
  function _fetchGridAtlas(map) {
    setGridStatus("loading");
    Promise.all([
      gridApi.substations(), gridApi.gridEdges(), gridApi.gencos(),
      gridApi.discos(), gridApi.offtakers(), gridApi.routes(),
      gridApi.lossModels(), gridApi.atccScenarios(),
    ]).then(([substations, edges, gencos, discos, offtakers, routes, lossModels, atccScenarios]) => {
      if (mapRef.current !== map) return; // stale map from a StrictMode double-mount — see the "load" handler above
      gridNodesRef.current = new Map(substations.map(s => [s.name, s]));
      gridPartiesRef.current = { gencos, discos, offtakers };
      gridRouteTableRef.current = routes;
      gridAtlasDataRef.current = { substations, edges, gencos, discos, offtakers };
      setGridParties({ gencos, discos, offtakers });
      setGridLossModels(lossModels);
      setGridAtccScenarios(atccScenarios);
      _renderGridAtlas(map);
      _bindGridAtlasHandlers(map);
      setGridStatus("ready");
    }).catch(err => {
      console.warn("Onction Grid Atlas API unavailable:", err.message);
      setGridStatus("error");
      setGridError(err.message);
    });
  }

  // Pure source/layer creation from cached data — no listeners. Callable on
  // initial load and again after every theme swap (setStyle wipes sources/layers
  // but not delegated listeners, so listeners must never be re-bound here).
  function _renderGridAtlas(map) {
    const data = gridAtlasDataRef.current;
    if (!data) return; // fetch hasn't resolved yet — _fetchGridAtlas will render once it does

    const { substations, edges, gencos, discos, offtakers } = data;

    const subFeatures = substations.map(s => ({ type: "Feature", properties: { ...s }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } }));
    map.addSource("grid-sub-src", { type: "geojson", data: { type: "FeatureCollection", features: subFeatures } });
    map.addLayer({ id: "grid-sub-circle", type: "circle", source: "grid-sub-src", paint: {
      "circle-radius": ["case", ["get", "is_injection"], 5, 3.5],
      "circle-color": GRID_C.sub,
      "circle-opacity": 0.85,
      "circle-stroke-color": "#fff", "circle-stroke-width": 1,
    } });
    map.addLayer({ id: "grid-sub-labels", type: "symbol", source: "grid-sub-src", minzoom: 7,
      layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 8, "text-offset": [0, 1.2], "text-anchor": "top" },
      paint: { "text-color": "#334455", "text-halo-color": "#fff", "text-halo-width": 1.4 } });

    // Grid corridors (edges) — resolve each edge's two endpoints to coordinates
    const edgeFeatures = edges
      .map(e => {
        const a = gridNodesRef.current.get(e.from_node), b = gridNodesRef.current.get(e.to_node);
        if (!a || !b) return null;
        return { type: "Feature", properties: { ...e }, geometry: { type: "LineString", coordinates: [[a.lon, a.lat], [b.lon, b.lat]] } };
      })
      .filter(Boolean);
    map.addSource("grid-edge-src", { type: "geojson", data: { type: "FeatureCollection", features: edgeFeatures } });
    map.addLayer({ id: "grid-edge-lines", type: "line", source: "grid-edge-src", paint: { "line-color": GRID_C.edge, "line-width": 1, "line-opacity": 0.55 } });

    // GenCos (PPA-backed)
    const gencoFeatures = gencos.map(g => ({ type: "Feature", properties: { ...g }, geometry: { type: "Point", coordinates: [g.lon, g.lat] } }));
    map.addSource("grid-genco-src", { type: "geojson", data: { type: "FeatureCollection", features: gencoFeatures } });
    map.addLayer({ id: "grid-genco-glow",   type: "circle", source: "grid-genco-src", paint: { "circle-radius": 18, "circle-color": GRID_C.genco, "circle-opacity": 0.12 } });
    map.addLayer({ id: "grid-genco-circle", type: "circle", source: "grid-genco-src", paint: { "circle-radius": 8, "circle-color": GRID_C.genco, "circle-opacity": 0.9, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
    map.addLayer({ id: "grid-genco-labels", type: "symbol", source: "grid-genco-src", layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 9, "text-offset": [0, 1.6], "text-anchor": "top", "text-allow-overlap": false }, paint: { "text-color": "#334455", "text-halo-color": "#fff", "text-halo-width": 1.5 } });

    // DisCos (PPA-backed)
    const discoFeatures = discos.map(d => ({ type: "Feature", properties: { ...d }, geometry: { type: "Point", coordinates: [d.lon, d.lat] } }));
    map.addSource("grid-disco-src", { type: "geojson", data: { type: "FeatureCollection", features: discoFeatures } });
    map.addLayer({ id: "grid-disco-circle", type: "circle", source: "grid-disco-src", paint: { "circle-radius": 9, "circle-color": GRID_C.disco, "circle-opacity": 0.9, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
    map.addLayer({ id: "grid-disco-labels", type: "symbol", source: "grid-disco-src", layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 9, "text-offset": [0, 1.6], "text-anchor": "top", "text-allow-overlap": false }, paint: { "text-color": "#334455", "text-halo-color": "#fff", "text-halo-width": 1.5 } });

    // Offtakers (eligible customers, PPA-backed)
    const offtakerFeatures = offtakers.map(o => ({ type: "Feature", properties: { ...o }, geometry: { type: "Point", coordinates: [o.lon, o.lat] } }));
    map.addSource("grid-offtaker-src", { type: "geojson", data: { type: "FeatureCollection", features: offtakerFeatures } });
    map.addLayer({ id: "grid-offtaker-glow",   type: "circle", source: "grid-offtaker-src", paint: { "circle-radius": 16, "circle-color": GRID_C.offtaker, "circle-opacity": 0.12 } });
    map.addLayer({ id: "grid-offtaker-circle", type: "circle", source: "grid-offtaker-src", paint: { "circle-radius": 7, "circle-color": GRID_C.offtaker, "circle-opacity": 0.9, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
    map.addLayer({ id: "grid-offtaker-labels", type: "symbol", source: "grid-offtaker-src", minzoom: 7, layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 8, "text-offset": [0, 1.5], "text-anchor": "top", "text-allow-overlap": false }, paint: { "text-color": "#334455", "text-halo-color": "#fff", "text-halo-width": 1.5 } });
  }

  // Ranks the OTHER side of the precomputed route table against `name` —
  // e.g. every offtaker a GenCo reaches, or every GenCo that reaches an offtaker —
  // by total distance, nearest first. Reads the cached table; no network call.
  function _nearestFor(name, sourceKind) {
    const rows = gridRouteTableRef.current.filter(r =>
      sourceKind === "GenCo" ? (r.genco === name && r.dest_kind === "offtaker") : r.dest_name === name
    );
    return rows
      .slice()
      .sort((a, b) => a.total_km - b.total_km)
      .map(r => ({
        name: sourceKind === "GenCo" ? r.dest_name : r.genco,
        routed_km: r.routed_km, last_mile_km: r.last_mile_km, total_km: r.total_km, hop_count: r.hop_count,
      }));
  }

  function _bindGridAtlasHandlers(map) {
    map.on("click", "grid-genco-circle", e => {
      featureHandled.current = true;
      const p = e.features[0].properties;
      setSelectedFeature({ name: p.name, type: "Onction GenCo Engagement", rows: [
        ["Commitment", p.commitment], ["Tariff", p.tariff_ngn_kwh ? `₦${p.tariff_ngn_kwh}/kWh` : "TBC"],
        ["Connection", p.connection_node], ["Capacity", p.capacity_note || ""],
      ] });
      setGridPresetGenco(p.name);
      setGridNearby({ sourceKind: "GenCo", sourceName: p.name, items: _nearestFor(p.name, "GenCo") });
    });
    map.on("mouseenter", "grid-genco-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "grid-genco-circle", () => { map.getCanvas().style.cursor = ""; });

    map.on("click", "grid-disco-circle", e => {
      featureHandled.current = true;
      const p = e.features[0].properties;
      setSelectedFeature({ name: p.name, type: "Onction DisCo Engagement", rows: [
        ["Contracted", p.contracted], ["Upstream source", p.upstream_source],
        ["Injection node", p.injection_node], ["Last mile", `${p.last_mile_km} km`],
      ] });
      setGridPresetDest(p.name);
      setGridNearby(null); // this list is only defined for GenCo <-> Offtaker
    });
    map.on("mouseenter", "grid-disco-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "grid-disco-circle", () => { map.getCanvas().style.cursor = ""; });

    map.on("click", "grid-offtaker-circle", e => {
      featureHandled.current = true;
      const p = e.features[0].properties;
      setSelectedFeature({ name: p.name, type: "Onction Offtaker", rows: [
        ["Capacity", `${p.capacity_mw} MW`], ["Location", p.location],
        ["Injection node", p.injection_node], ["Last mile", `${p.last_mile_km} km`],
      ] });
      setGridPresetDest(p.name);
      setGridNearby({ sourceKind: "Offtaker", sourceName: p.name, items: _nearestFor(p.name, "Offtaker") });
    });
    map.on("mouseenter", "grid-offtaker-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "grid-offtaker-circle", () => { map.getCanvas().style.cursor = ""; });
  }

  // Empty sources/layers for the route highlight — populated later by computeGridRoute.
  function _addGridRouteLayers(map) {
    map.addSource("grid-route-line-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource("grid-route-pt-src",   { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "grid-route-trunk", type: "line", source: "grid-route-line-src", filter: ["==", ["get", "kind"], "trunk"],
      paint: { "line-color": GRID_C.route, "line-width": 4, "line-opacity": 0.9 } });
    map.addLayer({ id: "grid-route-lastmile", type: "line", source: "grid-route-line-src", filter: ["==", ["get", "kind"], "lastmile"],
      paint: { "line-color": GRID_C.route, "line-width": 2.5, "line-opacity": 0.8, "line-dasharray": [2, 1.5] } });
    map.addLayer({ id: "grid-route-hops", type: "circle", source: "grid-route-pt-src", filter: ["==", ["get", "kind"], "hop"],
      paint: { "circle-radius": 5, "circle-color": GRID_C.route, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
    map.addLayer({ id: "grid-route-dest", type: "circle", source: "grid-route-pt-src", filter: ["==", ["get", "kind"], "dest"],
      paint: { "circle-radius": 7, "circle-color": "#e05252", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  }

  function _addBufferLayer(map) {
    map.addSource("buffers-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "buffers-fill",    type: "fill", source: "buffers-src", paint: { "fill-color": C.green, "fill-opacity": 0.07 } });
    map.addLayer({ id: "buffers-outline", type: "line", source: "buffers-src", paint: { "line-color": C.green, "line-width": 1.5, "line-opacity": 0.5, "line-dasharray": [3, 2] } });
    map.on("click", e => {
      if (featureHandled.current) { featureHandled.current = false; return; }
      if (modeRef.current === "measure") { _handleMeasureClick(map, e); return; }
      if (modeRef.current === "buffer") {
        const { buffered, gencoCount, totalCapacity, gencoNames } = computeBuffer([e.lngLat.lng, e.lngLat.lat], 150);
        _pushBuffer(map, buffered);
        setAnalysisText(_bufferHTML("150km buffer at clicked point", gencoCount, totalCapacity, gencoNames));
      }
    });
  }

  // ── Private helpers ──────────────────────────────────────────
  function _handleBufferOnFeature(map, lngLat, props) {
    const { buffered, gencoCount, discoCount, totalCapacity, gencoNames } = computeBuffer([lngLat.lng, lngLat.lat], 100);
    _pushBuffer(map, buffered);
    setAnalysisText(_bufferHTML(`100km — ${props.name}`, gencoCount, totalCapacity, gencoNames, discoCount));
  }
  function _handleMeasureClick(map, e) {
    measurePts.current.push([e.lngLat.lng, e.lngLat.lat]);
    if (measurePts.current.length === 2) {
      const [p1, p2] = measurePts.current;
      const { distanceKm, bearing } = measureDistance(p1, p2);
      measurePopups.current.push(
        new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat)
          .setHTML(`<div class="nga-popup"><p class="nga-popup-title">${distanceKm.toFixed(1)} km</p><p class="nga-popup-sub">straight-line</p></div>`).addTo(map)
      );
      setAnalysisText(`<strong style="color:#00e5a0">Distance: ${distanceKm.toFixed(1)} km</strong><br/>Bearing: ${bearing.toFixed(1)}°`);
      measurePts.current = [];
    } else {
      setAnalysisText(`<span style="color:#f5a623">Point 1 set.</span> Click second point.`);
    }
  }
  function _pushBuffer(map, feat) {
    bufferFeatures.current.push(feat);
    map.getSource("buffers-src")?.setData({ type: "FeatureCollection", features: bufferFeatures.current });
    setBufferCount(bufferFeatures.current.length);
    if (map.getLayoutProperty("buffers-fill", "visibility") === "none") {
      map.setLayoutProperty("buffers-fill", "visibility", "visible");
      map.setLayoutProperty("buffers-outline", "visibility", "visible");
      setLayerVis(v => ({ ...v, buffers: true }));
    }
  }
  function _bufferHTML(title, gc, cap, names, dc = null) {
    return `<strong style="color:#00e5a0">${title}</strong><br/><br/>GenCos inside: <strong style="color:#00e5a0">${gc}</strong><br/>Capacity: <strong style="color:#00e5a0">${cap} MW</strong>${dc != null ? `<br/>DISCOs: <strong style="color:#00e5a0">${dc}</strong>` : ""}${names.length ? "<br/><br/>" + names.map(n => `• ${n}`).join("<br/>") : ""}`;
  }
  function _showPopup(map, lngLat, title, subtitle, rows) {
    new maplibregl.Popup({ closeButton: true })
      .setLngLat(lngLat)
      .setHTML(`<div class="nga-popup"><p class="nga-popup-title">${title}</p><p class="nga-popup-sub">${subtitle}</p>${rows.map(([k, v]) => `<div class="nga-popup-row"><span class="nga-popup-key">${k}</span><span class="nga-popup-val">${v}</span></div>`).join("")}</div>`)
      .addTo(map);
  }

  // ── Visibility sync helper ──────────────────────────────────
  function _syncVisToMap(map, vis) {
    Object.entries(vis).forEach(([name, visible]) => {
      const v = visible ? "visible" : "none";
      (LAYER_GROUPS[name] || []).forEach(id => {
        try { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v); }
        catch (e) { console.warn("_syncVisToMap:", id, e.message); }
      });
    });
  }

  // ── Public API ───────────────────────────────────────────────
  // Safety-net: re-apply full visibility whenever state or mapReady changes.
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    _syncVisToMap(map, layerVis);
  }, [layerVis, mapReady]);

  const toggleLayer = useCallback((name) => {
    // Read the CURRENT value from the ref (avoids stale closure)
    const current = layerVisRef.current[name];
    const next = !current;

    // 1) Update React state (drives UI toggle switches)
    setLayerVis(prev => ({ ...prev, [name]: next }));

    // 2) ALSO directly update the map right now (doesn't wait for useEffect)
    const map = mapRef.current;
    if (map) {
      const vis = next ? "visible" : "none";
      (LAYER_GROUPS[name] || []).forEach(id => {
        try { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis); }
        catch (e) { console.warn("toggleLayer:", id, e.message); }
      });
    }
  }, []);

  const changeMode = useCallback((m) => {
    setMode(m); modeRef.current = m;
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = m === "explore" ? "" : "crosshair";
    if (m === "measure") { measurePts.current = []; setAnalysisText(`<span style="color:#f5a623">Click two points</span> to measure.`); }
    // buffer mode disabled
    // else if (m === "buffer") setAnalysisText(`Click a <span style="color:#f5a623">feature or open area</span> to draw a buffer.`);
  }, []);

  const runNearestGenco = useCallback(() => {
    const feat = lastClicked.current;
    if (!feat) { setAnalysisText(`<span style="color:#f5a623">Click a feature first.</span>`); return; }
    const r = findNearestGenco(feat.geometry.coordinates);
    mapRef.current?.flyTo({ center: r.coordinates, zoom: 8 });
    setAnalysisText(`<strong style="color:#00e5a0">Nearest GenCo:</strong> ${r.name}<br/>Capacity: ${r.capacity} MW<br/>Distance: ${r.distanceKm.toFixed(1)} km`);
  }, []);

  const clearAnalysis = useCallback(() => {
    bufferFeatures.current = []; setBufferCount(0);
    mapRef.current?.getSource("buffers-src")?.setData({ type: "FeatureCollection", features: [] });
    measurePopups.current.forEach(p => p.remove()); measurePopups.current = []; measurePts.current = [];
    setAnalysisText("Analysis cleared."); changeMode("explore");
  }, [changeMode]);

  const addPin = useCallback((lng, lat, label) => {
    const map = mapRef.current; if (!map) return;
    const id = `pin-${Date.now()}`;
    map.flyTo({ center: [lng, lat], zoom: 13, speed: 1.2 });
    const el = document.createElement("div");
    el.style.cssText = "width:20px;height:20px;border-radius:50% 50% 50% 0;background:#f5a623;transform:rotate(-45deg);border:2px solid rgba(245,166,35,0.4);box-shadow:0 2px 10px rgba(245,166,35,0.5);cursor:pointer;";
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat])
      .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(`<div class="nga-popup"><p class="nga-popup-title">📍 ${label}</p><div class="nga-popup-row"><span class="nga-popup-key">Lat</span><span class="nga-popup-val">${lat.toFixed(5)}°</span></div><div class="nga-popup-row"><span class="nga-popup-key">Lng</span><span class="nga-popup-val">${lng.toFixed(5)}°</span></div></div>`))
      .addTo(map);
    pinMarkersRef.current[id] = marker;
    setPins(prev => [...prev, { id, label, lat, lng }]);
  }, []);

  const flyToPin  = useCallback((pin) => { mapRef.current?.flyTo({ center: [pin.lng, pin.lat], zoom: 14 }); pinMarkersRef.current[pin.id]?.getPopup().addTo(mapRef.current); }, []);
  const removePin = useCallback((id)  => { pinMarkersRef.current[id]?.remove(); delete pinMarkersRef.current[id]; setPins(p => p.filter(x => x.id !== id)); }, []);
  const clearPins = useCallback(()    => { Object.values(pinMarkersRef.current).forEach(m => m.remove()); pinMarkersRef.current = {}; setPins([]); }, []);

  const exportGeoJSON = useCallback(() => {
    const features = [];
    if (layerVis.ci)    CI_CUSTOMERS.forEach(c => features.push({ type: "Feature", properties: { ...c, _type: "C&I" },   geometry: { type: "Point", coordinates: [c.lng, c.lat] } }));
    if (layerVis.discos) DISCOS.forEach(d =>      features.push({ type: "Feature", properties: { ...d, _type: "DISCO" }, geometry: { type: "Point", coordinates: [d.lng, d.lat] } }));
    if (layerVis.gencos)  GENCOS.forEach(g =>   features.push({ type: "Feature", properties: { ...g, _type: g.subtype || "GenCo" }, geometry: { type: "Point", coordinates: [g.lng, g.lat] } }));
    if (layerVis.traders) TRADERS.forEach(t =>  features.push({ type: "Feature", properties: { ...t, _type: "Trader" }, geometry: { type: "Point", coordinates: [t.lng, t.lat] } }));
    pins.forEach(p => features.push({ type: "Feature", properties: { label: p.label, _type: "Pin" }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ type: "FeatureCollection", features }, null, 2)], { type: "application/json" }));
    a.download = "nigeria-gis-export.geojson"; a.click();
    setAnalysisText(`<strong style="color:#00e5a0">Exported ${features.length} features.</strong>`);
  }, [layerVis, pins]);

  // ── Onction Grid route drawing + calculator ──────────────────────────
  function _drawGridRoute(map, result, destCoords) {
    const nodes = gridNodesRef.current;
    const trunkCoords = [];
    if (result.hops?.length) {
      const first = nodes.get(result.hops[0].from_node);
      if (first) trunkCoords.push([first.lon, first.lat]);
      result.hops.forEach(h => {
        const n = nodes.get(h.to_node);
        if (n) trunkCoords.push([n.lon, n.lat]);
      });
    }
    const lines = [];
    if (trunkCoords.length >= 2) {
      lines.push({ type: "Feature", properties: { kind: "trunk" }, geometry: { type: "LineString", coordinates: trunkCoords } });
    }
    const injectionNode = nodes.get(result.injection_node);
    if (injectionNode && destCoords && result.last_mile_km > 0) {
      lines.push({ type: "Feature", properties: { kind: "lastmile" }, geometry: { type: "LineString", coordinates: [[injectionNode.lon, injectionNode.lat], destCoords] } });
    }
    map.getSource("grid-route-line-src")?.setData({ type: "FeatureCollection", features: lines });

    const pts = (result.hops || []).map(h => {
      const n = nodes.get(h.to_node);
      return n ? { type: "Feature", properties: { kind: "hop", name: h.to_node }, geometry: { type: "Point", coordinates: [n.lon, n.lat] } } : null;
    }).filter(Boolean);
    if (destCoords) pts.push({ type: "Feature", properties: { kind: "dest", name: result.destination }, geometry: { type: "Point", coordinates: destCoords } });
    map.getSource("grid-route-pt-src")?.setData({ type: "FeatureCollection", features: pts });

    const allCoords = [...trunkCoords, ...(destCoords ? [destCoords] : [])];
    if (allCoords.length) {
      const bounds = allCoords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(allCoords[0], allCoords[0]));
      map.fitBounds(bounds, {
        padding: 60,
        maxZoom: 9,
        duration: 1500,
        essential: true,
        easing: (t) => 1 - Math.pow(1 - t, 3),
      });
    }
  }

  // Draws a manually-edited (admin override) route straight from already-resolved
  // coordinates — unlike _drawGridRoute, the named points here can be a GenCo,
  // DisCo, offtaker, or substation in any position, not just substation-to-substation
  // hops, so it can't reuse gridNodesRef's substation-only lookup.
  function _drawCustomRoute(map, resolvedNodes) {
    const coords = resolvedNodes.map(n => [n.resolved.lon, n.resolved.lat]);
    const lines = [];
    if (coords.length >= 3) {
      lines.push({ type: "Feature", properties: { kind: "trunk" }, geometry: { type: "LineString", coordinates: coords.slice(0, -1) } });
    }
    if (coords.length >= 2) {
      lines.push({ type: "Feature", properties: { kind: "lastmile" }, geometry: { type: "LineString", coordinates: coords.slice(-2) } });
    }
    map.getSource("grid-route-line-src")?.setData({ type: "FeatureCollection", features: lines });

    const pts = resolvedNodes.slice(1, -1).map(n => ({
      type: "Feature", properties: { kind: "hop", name: n.name }, geometry: { type: "Point", coordinates: [n.resolved.lon, n.resolved.lat] },
    }));
    const last = resolvedNodes[resolvedNodes.length - 1];
    pts.push({ type: "Feature", properties: { kind: "dest", name: last.name }, geometry: { type: "Point", coordinates: [last.resolved.lon, last.resolved.lat] } });
    map.getSource("grid-route-pt-src")?.setData({ type: "FeatureCollection", features: pts });

    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 9, duration: 1200, essential: true, easing: (t) => 1 - Math.pow(1 - t, 3) });
  }

  // Looks a typed name up across every party/node type the calculator knows about.
  function _resolveNodeByName(rawName) {
    const name = rawName.trim();
    const sub = gridNodesRef.current.get(name);
    if (sub) return { lat: sub.lat, lon: sub.lon, kind: "substation" };
    const { gencos, discos, offtakers } = gridPartiesRef.current;
    const g = gencos.find(x => x.name === name);    if (g) return { lat: g.lat, lon: g.lon, kind: "genco", raw: g };
    const d = discos.find(x => x.name === name);    if (d) return { lat: d.lat, lon: d.lon, kind: "disco", raw: d };
    const o = offtakers.find(x => x.name === name); if (o) return { lat: o.lat, lon: o.lon, kind: "offtaker", raw: o };
    return null;
  }

  // Admin override: parse a hand-edited "A → B → C" chain, resolve each name to
  // real coordinates, and treat it as the route — straight-line between the named
  // points (there's no corridor-network entry for an arbitrary shortcut like this,
  // so these distances are estimates, not TCN corridor lengths).
  const applyCustomRoute = useCallback((chainText, { lossModel, scenario } = {}) => {
    const names = chainText.split(/→|->/).map(s => s.trim()).filter(Boolean);
    if (names.length < 2) {
      setGridRouteResult({ error: "Enter at least a source and a destination, separated by →." });
      return null;
    }
    const nodes = names.map(name => ({ name, resolved: _resolveNodeByName(name) }));
    const missing = nodes.filter(n => !n.resolved).map(n => n.name);
    if (missing.length) {
      setGridRouteResult({ error: `Unrecognized location${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}` });
      return null;
    }

    const hops = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i].resolved, b = nodes[i + 1].resolved;
      const { distanceKm } = measureDistance([a.lon, a.lat], [b.lon, b.lat]);
      hops.push({ seq: i + 1, from_node: nodes[i].name, to_node: nodes[i + 1].name, km: Math.round(distanceKm * 10) / 10 });
    }
    const lastMileKm = hops[hops.length - 1].km;
    const trunkHops = hops.slice(0, -1);
    const routedKm = trunkHops.reduce((s, h) => s + h.km, 0);
    const totalKm = routedKm + lastMileKm;

    const model = gridLossModels.find(m => m.code === lossModel) || gridLossModels.find(m => m.is_default)
      || { code: "base", label: "Base loading", fixed_pct: 2, per_100km_pct: 1 };
    const lossPct = Math.round((model.fixed_pct + (routedKm / 100) * model.per_100km_pct) * 100) / 100;

    const gencoRaw = nodes[0].resolved.raw;
    const destRaw  = nodes[nodes.length - 1].resolved.raw;
    const destMw   = destRaw?.capacity_mw ?? null;
    const atcc = scenario ? gridAtccScenarios.find(a => a.code === scenario) : null;
    const projection = destMw != null ? (() => {
      const contracted_kwh = destMw * 1000 * 24 * 30;
      const delivered_kwh  = contracted_kwh * (1 - lossPct / 100);
      return {
        contracted_kwh, delivered_kwh,
        recovered_kwh: atcc ? delivered_kwh * (1 - atcc.atcc_pct / 100) : null,
        transmission_loss_kwh: contracted_kwh - delivered_kwh,
        atcc_loss_kwh: atcc ? delivered_kwh * (atcc.atcc_pct / 100) : null,
      };
    })() : null;

    const result = {
      genco: nodes[0].name,
      destination: nodes[nodes.length - 1].name,
      dest_kind: destRaw ? (nodes[nodes.length - 1].resolved.kind === "offtaker" ? "offtaker" : "disco") : "point",
      injection_node: nodes[nodes.length - 2].name,
      routed_km: Math.round(routedKm * 10) / 10,
      last_mile_km: lastMileKm,
      total_km: Math.round(totalKm * 10) / 10,
      hop_count: trunkHops.length,
      hops: trunkHops,
      loss_model: model,
      loss_pct: lossPct,
      commitment: gencoRaw?.commitment ?? null,
      tariff_ngn_kwh: gencoRaw?.tariff_ngn_kwh ?? null,
      dest_mw: destMw,
      atcc_scenario: atcc || null,
      projection,
      isCustom: true,
    };

    setGridRouteResult(result);
    setGridBestSource(null);
    const last = nodes[nodes.length - 1].resolved;
    const destCoords = [last.lon, last.lat];
    lastGridRouteRef.current = { result, destCoords, resolvedNodes: nodes };
    if (mapRef.current) _drawCustomRoute(mapRef.current, nodes);
    return result;
  }, [gridLossModels, gridAtccScenarios]);

  function _resolveDestCoords(destName, lat, lng) {
    if (lat != null && lng != null) return [Number(lng), Number(lat)];
    const { offtakers, discos } = gridPartiesRef.current;
    const off = offtakers.find(o => o.name === destName);
    if (off) return [off.lon, off.lat];
    const disco = discos.find(d => d.name === destName);
    if (disco) return [disco.lon, disco.lat];
    return null;
  }

  // `label` is display-only, for a pinned point that has no name the API knows about —
  // the backend just calls it "(lat, lng)" since it only resolves lat/lng to a substation.
  const computeGridRoute = useCallback(async ({ genco, dest, lat, lng, label, lossModel, scenario, mw }) => {
    try {
      const result = await gridApi.route({ genco, dest, lat, lng, lossModel, scenario, mw });
      if (result.error) { setGridRouteResult(result); return null; }
      if (label) result.destination = label;
      setGridRouteResult(result);
      setGridBestSource(null);
      const destCoords = _resolveDestCoords(dest, lat, lng);
      lastGridRouteRef.current = { result, destCoords };
      if (mapRef.current) _drawGridRoute(mapRef.current, result, destCoords);
      return result;
    } catch (err) {
      setGridRouteResult({ error: err.message });
      return null;
    }
  }, []);

  const computeGridBestSource = useCallback(async ({ dest, lat, lng, label, lossModel, scenario, mw }) => {
    try {
      const { destination, results } = await gridApi.bestSource({ dest, lat, lng, lossModel, scenario, mw });
      const displayDest = label || destination;
      if (label) results.forEach(r => { r.destination = label; });
      setGridBestSource({ destination: displayDest, results });
      setGridRouteResult(null);
      const best = results[0];
      const destCoords = _resolveDestCoords(dest, lat, lng);
      if (best) lastGridRouteRef.current = { result: best, destCoords };
      if (best && mapRef.current) _drawGridRoute(mapRef.current, best, destCoords);
      return results;
    } catch (err) {
      setGridBestSource({ error: err.message });
      return null;
    }
  }, []);

  const clearGridRoute = useCallback(() => {
    setGridRouteResult(null);
    setGridBestSource(null);
    lastGridRouteRef.current = null;
    mapRef.current?.getSource("grid-route-line-src")?.setData({ type: "FeatureCollection", features: [] });
    mapRef.current?.getSource("grid-route-pt-src")?.setData({ type: "FeatureCollection", features: [] });
  }, []);

  const searchAndFly = useCallback((query) => {
    if (!query || query.length < 2 || !mapRef.current) return;
    const q = query.toLowerCase();
    const ci = CI_CUSTOMERS.find(x => x.name.toLowerCase().includes(q));
    if (ci) { mapRef.current.flyTo({ center: [ci.lng, ci.lat], zoom: 11 }); return; }
    const d = DISCOS.find(x => x.name.toLowerCase().includes(q) || x.id.toLowerCase().includes(q));
    if (d)  { mapRef.current.flyTo({ center: [d.lng,  d.lat],  zoom: 9  }); return; }
    const g = GENCOS.find(x => x.name.toLowerCase().includes(q));
    if (g)  { mapRef.current.flyTo({ center: [g.lng,  g.lat],  zoom: 10 }); }
  }, []);

  return {
    containerRef, mapReady, coords, zoom,
    mode, changeMode,
    layerVis, toggleLayer,
    selectedFeature, analysisText, bufferCount,
    pins, addPin, flyToPin, removePin, clearPins,
    runNearestGenco, clearAnalysis, exportGeoJSON, searchAndFly,
    // Onction Grid Atlas
    gridStatus, gridError, gridParties, gridLossModels, gridAtccScenarios,
    gridRouteResult, gridBestSource, gridPresetGenco, gridPresetDest, gridNearby,
    computeGridRoute, computeGridBestSource, clearGridRoute, applyCustomRoute,
  };
}
