// ─────────────────────────────────────────────────────────────
//  useNigeriaMap — MapLibre GL + GIS logic hook
//
//  Owns: map init, layer add/remove, mode switching,
//        Turf analysis, multiple location pins, export.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { DISCOS, GENCOS, TRANSMISSION, CI_CUSTOMERS, getZoneForState } from "../data";
import { computeBuffer, measureDistance, findNearestGenco } from "../utils/analysis";

const MAP_COLORS = {
  accent:  "#f5a623",
  green:   "#00e5a0",
  red:     "#e05252",
  purple:  "#7c6af8",
  cyan:    "#22d3ee",
  text:    "#d8dde8",
  muted:   "#8090a8",
  bg:      "#080b0f",
  panel:   "#0d1117",
  border:  "#1c2535",
};

export const LAYER_GROUPS = {
  ci:           ["ci-circle", "ci-glow", "ci-labels"],
  states:       ["states-fill", "states-outline", "states-hover", "states-labels"],
  zones:        ["states-zone-fill"],
  discos:       ["discos-circle", "discos-glow", "discos-labels"],
  gencos:       ["gencos-circle", "gencos-glow"],
  transmission: ["transmission-lines", "transmission-glow"],
  buffers:      ["buffers-fill", "buffers-outline"],
};

const INITIAL_VISIBILITY = {
  ci: true, states: true, zones: false,
  discos: false, gencos: false, transmission: false, buffers: false,
};

export default function useNigeriaMap({ isDark, BASEMAP } = {}) {
  const containerRef       = useRef(null);
  const mapRef             = useRef(null);
  const modeRef            = useRef("explore");
  const featureHandled     = useRef(false);
  const lastClickedFeature = useRef(null);
  const measurePts         = useRef([]);
  const bufferFeatures     = useRef([]);
  const measurePopups      = useRef([]);
  // Multiple pins: map of id → maplibregl.Marker
  const pinMarkersRef      = useRef({});

  const [mapReady,        setMapReady]        = useState(false);
  const [coords,          setCoords]          = useState("");
  const [zoom,            setZoom]            = useState(6);
  const [mode,            setMode]            = useState("explore");
  const [layerVis,        setLayerVis]        = useState(INITIAL_VISIBILITY);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [analysisText,    setAnalysisText]    = useState("Select a tool in the toolbar to run spatial analysis.");
  const [bufferCount,     setBufferCount]     = useState(0);
  // Pins: array of { id, label, lat, lng }
  const [pins,            setPins]            = useState([]);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  // ── Listen for theme changes from App and swap basemap tiles ─
  useEffect(() => {
    function handleTheme(e) {
      const map = mapRef.current;
      if (!map) return;
      const tileUrl = e.detail.dark ? BASEMAP.dark : BASEMAP.light;

      // Wait until the map is idle before swapping tiles to avoid AbortError
      const doSwap = () => {
        try {
          const src = map.getSource("osm");
          if (src && typeof src.setTiles === "function") {
            src.setTiles([tileUrl]);
          }
        } catch (err) {
          // AbortError from an in-flight tile request — safe to ignore
          if (err.name !== "AbortError") console.warn("Basemap swap error:", err);
        }
      };

      if (map.loaded()) {
        doSwap();
      } else {
        map.once("idle", doSwap);
      }
    }
    window.addEventListener("gis:theme", handleTheme);
    return () => window.removeEventListener("gis:theme", handleTheme);
  }, [BASEMAP]);

  // ── Map init ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors © CARTO",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm", minzoom: 0, maxzoom: 22 }],
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      },
      center: [8.0, 9.0], zoom: 6, minZoom: 4, maxZoom: 18,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.on("mousemove", e => setCoords(`${e.lngLat.lat.toFixed(5)}°N  ${e.lngLat.lng.toFixed(5)}°E`));
    map.on("zoom", () => setZoom(map.getZoom()));

    map.on("load", () => {
      _addStatesLayer(map);
      _addTransmissionLayer(map);
      _addDISCOLayer(map);
      _addGencoLayer(map);
      _addCILayer(map);       // C&I on top (added last = renders on top)
      _addBufferLayer(map);
      setMapReady(true);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── State boundaries ────────────────────────────────────────
  function _addStatesLayer(map) {
    // Primary URL; fallback in case GitHub raw is blocked (e.g. corp proxies)
    const PRIMARY = "https://raw.githubusercontent.com/wmgeolab/geoBoundaries/main/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1_simplified.geojson";
    const FALLBACK = "https://cdn.jsdelivr.net/gh/wmgeolab/geoBoundaries@main/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1_simplified.geojson";

    const fetchWithFallback = () =>
      fetch(PRIMARY, { signal: AbortSignal.timeout(10000) })
        .catch(() => fetch(FALLBACK, { signal: AbortSignal.timeout(15000) }));

    fetchWithFallback()
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(gj => {
        gj.features.forEach(f => {
          const name = f.properties.shapeName || f.properties.NAME_1 || "";
          const { zone, color } = getZoneForState(name);
          Object.assign(f.properties, { _stateName: name, _zone: zone, _zoneColor: color });
        });
        map.addSource("states-src", { type: "geojson", data: gj, generateId: true });
        map.addLayer({ id: "states-zone-fill", type: "fill", source: "states-src",
          layout: { visibility: "none" },
          paint: { "fill-color": ["get", "_zoneColor"], "fill-opacity": 0.55 } });
        map.addLayer({ id: "states-fill", type: "fill", source: "states-src",
          paint: { "fill-color": ["get", "_zoneColor"], "fill-opacity": 0.28 } });
        map.addLayer({ id: "states-outline", type: "line", source: "states-src",
          paint: { "line-color": "#3a5070", "line-width": 1, "line-opacity": 0.9 } });
        map.addLayer({ id: "states-hover", type: "fill", source: "states-src",
          paint: { "fill-color": "#fff",
            "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.06, 0] } });
        map.addLayer({ id: "states-labels", type: "symbol", source: "states-src", minzoom: 5,
          layout: { "text-field": ["get", "_stateName"], "text-font": ["Open Sans Regular"],
            "text-size": 9, "text-allow-overlap": false },
          paint: { "text-color": MAP_COLORS.muted, "text-halo-color": MAP_COLORS.bg, "text-halo-width": 1.5 } });

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
          setSelectedFeature({ name: p._stateName, type: `State — ${p._zone}`,
            rows: [["Geopolitical Zone", p._zone], ["Country", "Nigeria"]] });
        });
      })
      .catch(err => {
        // Don't crash the whole app — state boundaries are decorative
        console.warn("State boundaries unavailable (network issue):", err.message);
        setAnalysisText(
          `<span style="color:#e05252">⚠ State boundaries failed to load</span><br/>` +
          `<span style="opacity:0.7">Check your internet connection.<br/>All other layers are unaffected.</span>`
        );
      });
  }

  // ── Transmission ────────────────────────────────────────────
  function _addTransmissionLayer(map) {
    const features = TRANSMISSION.map(t => ({
      type: "Feature", id: t.id, properties: { ...t },
      geometry: { type: "LineString", coordinates: t.coords },
    }));
    map.addSource("transmission-src", { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer({ id: "transmission-glow", type: "line", source: "transmission-src",
      layout: { visibility: "none" },
      paint: { "line-color": MAP_COLORS.red, "line-width": 6, "line-opacity": 0.04 } });
    map.addLayer({ id: "transmission-lines", type: "line", source: "transmission-src",
      layout: { visibility: "none" },
      paint: { "line-color": MAP_COLORS.red, "line-width": 1.4, "line-dasharray": [5, 3], "line-opacity": 0.65 } });
    map.on("click", "transmission-lines", e => {
      if (modeRef.current !== "explore") return;
      const p = e.features[0].properties;
      setSelectedFeature({ name: p.name, type: "Transmission Line", rows: [["Voltage", p.voltage]] });
    });
    map.on("mouseenter", "transmission-lines", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "transmission-lines", () => { map.getCanvas().style.cursor = ""; });
  }

  // ── DISCOs ──────────────────────────────────────────────────
  function _addDISCOLayer(map) {
    const features = DISCOS.map(d => ({
      type: "Feature", id: d.id, properties: { ...d },
      geometry: { type: "Point", coordinates: [d.lng, d.lat] },
    }));
    map.addSource("discos-src", { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer({ id: "discos-glow", type: "circle", source: "discos-src",
      layout: { visibility: "none" },
      paint: { "circle-radius": 22, "circle-color": ["get", "color"], "circle-opacity": 0.08 } });
    map.addLayer({ id: "discos-circle", type: "circle", source: "discos-src",
      layout: { visibility: "none" },
      paint: { "circle-radius": 10, "circle-color": ["get", "color"], "circle-opacity": 0.9,
        "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.3 } });
    map.addLayer({ id: "discos-labels", type: "symbol", source: "discos-src",
      layout: { visibility: "none", "text-field": ["get", "id"], "text-font": ["Open Sans Bold"],
        "text-size": 7, "text-offset": [0, 2.2], "text-anchor": "top" },
      paint: { "text-color": MAP_COLORS.text, "text-halo-color": MAP_COLORS.panel, "text-halo-width": 1.5 } });
    map.on("click", "discos-circle", e => {
      featureHandled.current = true;
      const p = e.features[0].properties;
      lastClickedFeature.current = e.features[0];
      setSelectedFeature({ name: p.name, type: "Distribution Company (DISCO)",
        rows: [["Short Name", p.id], ["Coverage", p.states], ["Customers", p.customers], ["Capacity", p.capacity]] });
      if (modeRef.current === "buffer") { _handleBufferOnFeature(map, e.lngLat, p); return; }
      _showPopup(map, e.lngLat, p.name, "Distribution Company",
        [["ID", p.id], ["Customers", p.customers], ["Capacity", p.capacity]]);
    });
    map.on("mouseenter", "discos-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "discos-circle", () => { map.getCanvas().style.cursor = ""; });
  }

  // ── GenCos ──────────────────────────────────────────────────
  function _addGencoLayer(map) {
    const features = GENCOS.map(g => ({
      type: "Feature", id: g.id, properties: { ...g },
      geometry: { type: "Point", coordinates: [g.lng, g.lat] },
    }));
    map.addSource("gencos-src", { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer({ id: "gencos-glow", type: "circle", source: "gencos-src",
      layout: { visibility: "none" },
      paint: { "circle-radius": 18,
        "circle-color": ["case", ["==", ["get", "type"], "Hydro"], MAP_COLORS.green, MAP_COLORS.cyan],
        "circle-opacity": 0.08 } });
    map.addLayer({ id: "gencos-circle", type: "circle", source: "gencos-src",
      layout: { visibility: "none" },
      paint: { "circle-radius": 7,
        "circle-color": ["case", ["==", ["get", "type"], "Hydro"], MAP_COLORS.green, MAP_COLORS.cyan],
        "circle-opacity": 0.95,
        "circle-stroke-color": "#fff", "circle-stroke-width": 1, "circle-stroke-opacity": 0.25 } });
    map.on("click", "gencos-circle", e => {
      featureHandled.current = true;
      const p = e.features[0].properties;
      lastClickedFeature.current = e.features[0];
      setSelectedFeature({ name: p.name, type: `${p.type} Power Plant`,
        rows: [["Capacity", `${p.capacity} MW`], ["Fuel", p.fuel], ["Owner", p.owner]] });
      if (modeRef.current === "buffer") { _handleBufferOnFeature(map, e.lngLat, p); return; }
      _showPopup(map, e.lngLat, p.name, `${p.type} Power Plant`,
        [["Capacity", `${p.capacity} MW`], ["Fuel", p.fuel], ["Owner", p.owner]]);
    });
    map.on("mouseenter", "gencos-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "gencos-circle", () => { map.getCanvas().style.cursor = ""; });
  }

  // ── C&I Customers (primary layer) ───────────────────────────
  function _addCILayer(map) {
    const features = CI_CUSTOMERS.map(c => ({
      type: "Feature", id: c.id, properties: { ...c },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    }));
    map.addSource("ci-src", { type: "geojson", data: { type: "FeatureCollection", features } });

    // Glow
    map.addLayer({ id: "ci-glow", type: "circle", source: "ci-src",
      paint: { "circle-radius": 16, "circle-color": MAP_COLORS.purple, "circle-opacity": 0.1 } });

    // Main dot
    map.addLayer({ id: "ci-circle", type: "circle", source: "ci-src",
      paint: { "circle-radius": 8, "circle-color": MAP_COLORS.purple, "circle-opacity": 0.9,
        "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.3 } });

    // Labels
    map.addLayer({ id: "ci-labels", type: "symbol", source: "ci-src", minzoom: 8,
      layout: { "text-field": ["get", "name"], "text-font": ["Open Sans Regular"],
        "text-size": 9, "text-offset": [0, 1.8], "text-anchor": "top", "text-allow-overlap": false },
      paint: { "text-color": MAP_COLORS.text, "text-halo-color": MAP_COLORS.bg, "text-halo-width": 1.5 } });

    map.on("click", "ci-circle", e => {
      featureHandled.current = true;
      const p = e.features[0].properties;
      lastClickedFeature.current = e.features[0];
      setSelectedFeature({
        name: p.name,
        type: `C&I Customer — ${p.sector}`,
        rows: [
          ["State",   p.state],
          ["Sector",  p.sector],
          ...(p.address && p.address !== 'undefined' ? [["Address", p.address]] : []),
          ...(p.phone  && p.phone  !== 'undefined' && p.phone.length > 3  ? [["Phone",   p.phone]]  : []),
          ...(p.email  && p.email  !== 'undefined' && p.email.includes('@') ? [["Email", p.email]]  : []),
        ],
      });
      if (modeRef.current === "buffer") { _handleBufferOnFeature(map, e.lngLat, p); return; }

      // Rich popup
      const addrRow  = p.address && p.address !== 'undefined'
        ? `<div class="nga-popup-row"><span class="nga-popup-key">Address</span><span class="nga-popup-val" style="max-width:160px;word-wrap:break-word">${p.address}</span></div>` : '';
      const phoneRow = p.phone && p.phone.length > 3
        ? `<div class="nga-popup-row"><span class="nga-popup-key">Phone</span><span class="nga-popup-val">${p.phone}</span></div>` : '';
      const emailRow = p.email && p.email.includes('@')
        ? `<div class="nga-popup-row"><span class="nga-popup-key">Email</span><span class="nga-popup-val" style="word-break:break-all;max-width:160px">${p.email}</span></div>` : '';

      new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="nga-popup">` +
          `<p class="nga-popup-title">${p.name}</p>` +
          `<p class="nga-popup-sub">C&amp;I — ${p.sector} · ${p.state}</p>` +
          addrRow + phoneRow + emailRow +
          `</div>`
        )
        .addTo(map);
    });
    map.on("mouseenter", "ci-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "ci-circle", () => { map.getCanvas().style.cursor = ""; });
  }

  // ── Buffer layer + map click handler ────────────────────────
  function _addBufferLayer(map) {
    map.addSource("buffers-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "buffers-fill", type: "fill", source: "buffers-src",
      layout: { visibility: "none" },
      paint: { "fill-color": MAP_COLORS.green, "fill-opacity": 0.07 } });
    map.addLayer({ id: "buffers-outline", type: "line", source: "buffers-src",
      layout: { visibility: "none" },
      paint: { "line-color": MAP_COLORS.green, "line-width": 1.5, "line-opacity": 0.5, "line-dasharray": [3, 2] } });

    map.on("click", e => {
      if (featureHandled.current) { featureHandled.current = false; return; }
      if (modeRef.current === "measure") { _handleMeasureClick(map, e); return; }
      if (modeRef.current === "buffer") {
        const { buffered, gencoCount, totalCapacity, gencoNames } =
          computeBuffer([e.lngLat.lng, e.lngLat.lat], 150);
        _pushBuffer(map, buffered);
        setAnalysisText(_bufferHTML("150km buffer at clicked point", gencoCount, totalCapacity, gencoNames));
      }
    });
  }

  // ── Private helpers ─────────────────────────────────────────
  function _handleBufferOnFeature(map, lngLat, props) {
    const { buffered, gencoCount, discoCount, totalCapacity, gencoNames } =
      computeBuffer([lngLat.lng, lngLat.lat], 100);
    _pushBuffer(map, buffered);
    setAnalysisText(_bufferHTML(`100km buffer — ${props.name}`, gencoCount, totalCapacity, gencoNames, discoCount));
  }

  function _handleMeasureClick(map, e) {
    measurePts.current.push([e.lngLat.lng, e.lngLat.lat]);
    if (measurePts.current.length === 2) {
      const [p1, p2] = measurePts.current;
      const { distanceKm, bearing } = measureDistance(p1, p2);
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
        .setLngLat(e.lngLat)
        .setHTML(`<div class="nga-popup"><p class="nga-popup-title">${distanceKm.toFixed(1)} km</p><p class="nga-popup-sub">straight-line distance</p></div>`)
        .addTo(map);
      measurePopups.current.push(popup);
      setAnalysisText(
        `<strong style="color:#00e5a0">Distance Measured</strong><br/><br/>` +
        `From: <span style="color:#f5a623">${p1[1].toFixed(4)}°N, ${p1[0].toFixed(4)}°E</span><br/>` +
        `To: <span style="color:#f5a623">${p2[1].toFixed(4)}°N, ${p2[0].toFixed(4)}°E</span><br/><br/>` +
        `Distance: <strong style="color:#00e5a0">${distanceKm.toFixed(1)} km</strong><br/>` +
        `Bearing: <strong style="color:#00e5a0">${bearing.toFixed(1)}°</strong>`
      );
      measurePts.current = [];
    } else {
      setAnalysisText(`<span style="color:#f5a623">Point 1 set.</span><br/>Click a second point to measure.`);
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
    return (
      `<strong style="color:#00e5a0">${title}</strong><br/><br/>` +
      `GenCos inside: <strong style="color:#00e5a0">${gc}</strong><br/>` +
      `Combined capacity: <strong style="color:#00e5a0">${cap} MW</strong><br/>` +
      (dc !== null ? `DISCOs inside: <strong style="color:#00e5a0">${dc}</strong><br/>` : "") +
      (names.length ? `<br/>${names.map(n => `• ${n}`).join("<br/>")}` : "")
    );
  }

  function _showPopup(map, lngLat, title, subtitle, rows) {
    const rowsHtml = rows.map(([k, v]) =>
      `<div class="nga-popup-row"><span class="nga-popup-key">${k}</span><span class="nga-popup-val">${v}</span></div>`
    ).join("");
    new maplibregl.Popup({ closeButton: true })
      .setLngLat(lngLat)
      .setHTML(`<div class="nga-popup"><p class="nga-popup-title">${title}</p><p class="nga-popup-sub">${subtitle}</p>${rowsHtml}</div>`)
      .addTo(map);
  }

  // ── Public: layer toggle ────────────────────────────────────
  const toggleLayer = useCallback((name) => {
    setLayerVis(prev => {
      const next = { ...prev, [name]: !prev[name] };
      const vis  = next[name] ? "visible" : "none";
      const map  = mapRef.current;
      if (map) (LAYER_GROUPS[name] || []).forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
      });
      return next;
    });
  }, []);

  // ── Public: mode change ─────────────────────────────────────
  const changeMode = useCallback((m) => {
    setMode(m);
    modeRef.current = m;
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = m === "explore" ? "" : "crosshair";
    if (m === "measure") {
      measurePts.current = [];
      setAnalysisText(`<span style="color:#f5a623">Click two points</span> on the map to measure distance.`);
    } else if (m === "buffer") {
      setAnalysisText(`Click a <span style="color:#f5a623">feature</span> or any open area to draw a buffer.`);
    }
  }, []);

  // ── Public: nearest GenCo ───────────────────────────────────
  const runNearestGenco = useCallback(() => {
    const feat = lastClickedFeature.current;
    if (!feat) {
      setAnalysisText(`<span style="color:#f5a623">Click a feature first</span>, then use this tool.`);
      return;
    }
    const result = findNearestGenco(feat.geometry.coordinates);
    mapRef.current?.flyTo({ center: result.coordinates, zoom: 8, speed: 0.8 });
    setAnalysisText(
      `<strong style="color:#00e5a0">Nearest GenCo</strong> to ${feat.properties.name}:<br/><br/>` +
      `<span style="color:#f5a623">${result.name}</span><br/>` +
      `Type: <strong style="color:#00e5a0">${result.type}</strong><br/>` +
      `Capacity: <strong style="color:#00e5a0">${result.capacity} MW</strong><br/>` +
      `Distance: <strong style="color:#00e5a0">${result.distanceKm.toFixed(1)} km</strong>`
    );
  }, []);

  // ── Public: clear analysis ──────────────────────────────────
  const clearAnalysis = useCallback(() => {
    bufferFeatures.current = [];
    setBufferCount(0);
    mapRef.current?.getSource("buffers-src")
      ?.setData({ type: "FeatureCollection", features: [] });
    measurePopups.current.forEach(p => p.remove());
    measurePopups.current = [];
    measurePts.current = [];
    setAnalysisText("Analysis cleared. Select a tool to begin.");
    changeMode("explore");
  }, [changeMode]);

  // ── Public: add a pin ───────────────────────────────────────
  const addPin = useCallback((lng, lat, label) => {
    const map = mapRef.current; if (!map) return;

    const id = `pin-${Date.now()}`;

    // Fly to location
    map.flyTo({ center: [lng, lat], zoom: 13, speed: 1.2 });

    // Build marker element
    const el = document.createElement("div");
    el.style.cssText = [
      "width:22px", "height:22px", "border-radius:50% 50% 50% 0",
      "background:#f5a623", "transform:rotate(-45deg)",
      "border:2px solid rgba(245,166,35,0.4)",
      "box-shadow:0 2px 12px rgba(245,166,35,0.5)",
      "cursor:pointer",
    ].join(";");

    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat])
      .setPopup(
        new maplibregl.Popup({ offset: 20 }).setHTML(
          `<div class="nga-popup">` +
          `<p class="nga-popup-title">📍 ${label}</p>` +
          `<div class="nga-popup-row"><span class="nga-popup-key">Lat</span><span class="nga-popup-val">${lat.toFixed(5)}°</span></div>` +
          `<div class="nga-popup-row"><span class="nga-popup-key">Lng</span><span class="nga-popup-val">${lng.toFixed(5)}°</span></div>` +
          `</div>`
        )
      )
      .addTo(map);

    pinMarkersRef.current[id] = marker;
    setPins(prev => [...prev, { id, label, lat, lng }]);
  }, []);

  // ── Public: fly to existing pin ─────────────────────────────
  const flyToPin = useCallback((pin) => {
    mapRef.current?.flyTo({ center: [pin.lng, pin.lat], zoom: 14, speed: 1 });
    pinMarkersRef.current[pin.id]?.getPopup().addTo(mapRef.current);
  }, []);

  // ── Public: remove a single pin ─────────────────────────────
  const removePin = useCallback((id) => {
    pinMarkersRef.current[id]?.remove();
    delete pinMarkersRef.current[id];
    setPins(prev => prev.filter(p => p.id !== id));
  }, []);

  // ── Public: clear all pins ──────────────────────────────────
  const clearPins = useCallback(() => {
    Object.values(pinMarkersRef.current).forEach(m => m.remove());
    pinMarkersRef.current = {};
    setPins([]);
  }, []);

  // ── Public: GeoJSON export ──────────────────────────────────
  const exportGeoJSON = useCallback(() => {
    const features = [];
    if (layerVis.ci) CI_CUSTOMERS.forEach(c => features.push(
      { type: "Feature", properties: { ...c, _type: "C&I" }, geometry: { type: "Point", coordinates: [c.lng, c.lat] } }
    ));
    if (layerVis.discos) DISCOS.forEach(d => features.push(
      { type: "Feature", properties: { ...d, _type: "DISCO" }, geometry: { type: "Point", coordinates: [d.lng, d.lat] } }
    ));
    if (layerVis.gencos) GENCOS.forEach(g => features.push(
      { type: "Feature", properties: { ...g, _type: "GenCo" }, geometry: { type: "Point", coordinates: [g.lng, g.lat] } }
    ));
    // Include pinned locations in export
    pins.forEach(p => features.push(
      { type: "Feature", properties: { label: p.label, _type: "Pin" }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } }
    ));
    const blob = new Blob([JSON.stringify({ type: "FeatureCollection", features }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nigeria-gis-export.geojson";
    a.click();
    setAnalysisText(`<strong style="color:#00e5a0">Exported ${features.length} features</strong> as GeoJSON (includes ${pins.length} pins).`);
  }, [layerVis, pins]);

  // ── Public: search and fly ──────────────────────────────────
  const searchAndFly = useCallback((query) => {
    if (!query || query.length < 2 || !mapRef.current) return;
    const q = query.toLowerCase();
    const ci = CI_CUSTOMERS.find(x => x.name.toLowerCase().includes(q));
    if (ci) { mapRef.current.flyTo({ center: [ci.lng, ci.lat], zoom: 11, speed: 1 }); return; }
    const d  = DISCOS.find(x => x.name.toLowerCase().includes(q) || x.id.toLowerCase().includes(q));
    if (d)  { mapRef.current.flyTo({ center: [d.lng,  d.lat],  zoom: 9,  speed: 1 }); return; }
    const g  = GENCOS.find(x => x.name.toLowerCase().includes(q));
    if (g)  { mapRef.current.flyTo({ center: [g.lng,  g.lat],  zoom: 10, speed: 1 }); }
  }, []);

  return {
    containerRef, mapReady,
    coords, zoom,
    mode, changeMode,
    layerVis, toggleLayer,
    selectedFeature,
    analysisText, bufferCount,
    pins, addPin, flyToPin, removePin, clearPins,
    runNearestGenco,
    clearAnalysis,
    exportGeoJSON,
    searchAndFly,
  };
}

