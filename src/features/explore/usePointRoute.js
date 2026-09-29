import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { gridApi } from "@/lib/gridApi";
import { runSiteScan } from "./siteScan";
import { routeParams } from "./places";

// Point-to-point routing for Explore: any place → any place over the built
// grid, plus the same site stats the scanner shows for each end. Draws its
// own "ptroute-" layers and A/B markers; never touches useNigeriaMap's.

export const END_COLORS = { from: "#10b981", to: "#f43f5e" };
const LINE = "#f5a623";
const EMPTY = { type: "FeatureCollection", features: [] };

function ensureLayers(map) {
  if (map.getSource("ptroute-lines-src")) return;
  map.addSource("ptroute-lines-src", { type: "geojson", data: EMPTY });
  map.addSource("ptroute-pts-src", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ptroute-glow", type: "line", source: "ptroute-lines-src", filter: ["==", ["get", "kind"], "trunk"],
    layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": LINE, "line-width": 10, "line-opacity": 0.2, "line-blur": 4 } });
  map.addLayer({ id: "ptroute-trunk", type: "line", source: "ptroute-lines-src", filter: ["==", ["get", "kind"], "trunk"],
    layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": LINE, "line-width": 3.5 } });
  map.addLayer({ id: "ptroute-miles", type: "line", source: "ptroute-lines-src", filter: ["==", ["get", "kind"], "mile"],
    layout: { "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-dasharray": [1, 1.6] } });
  map.addLayer({ id: "ptroute-hops", type: "circle", source: "ptroute-pts-src",
    paint: { "circle-radius": 4.5, "circle-color": "#0b1220", "circle-stroke-color": LINE, "circle-stroke-width": 2 } });
  map.addLayer({ id: "ptroute-hop-labels", type: "symbol", source: "ptroute-pts-src",
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 10.5, "text-offset": [0, 1.1], "text-anchor": "top" },
    paint: { "text-color": LINE, "text-halo-color": "rgba(0,0,0,0.75)", "text-halo-width": 1.6 } });
}

function endMarker(letter, color) {
  const el = document.createElement("div");
  el.className = "route-end-marker";
  el.style.setProperty("--end-color", color);
  el.textContent = letter;
  return el;
}

export default function usePointRoute({ mapRef, mapReady, getSubstations, offtakers }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [mw, setMw] = useState("");
  const [route, setRoute] = useState({ status: "idle" });     // idle | loading | ready | error
  const [ends, setEnds] = useState({ from: null, to: null });  // runSiteScan results (without GenCo ranking)
  const routeRef = useRef(null);
  const markersRef = useRef([]);
  const abortRef = useRef(null);
  const offtakersRef = useRef(offtakers);
  offtakersRef.current = offtakers;

  const nodeCoords = useCallback((name) => {
    const n = getSubstations().find(s => s.name === name);
    return n ? [n.lon, n.lat] : null;
  }, [getSubstations]);

  const clearMap = useCallback(() => {
    const map = mapRef.current;
    markersRef.current.forEach(m => m.remove()); markersRef.current = [];
    map?.getSource("ptroute-lines-src")?.setData(EMPTY);
    map?.getSource("ptroute-pts-src")?.setData(EMPTY);
  }, [mapRef]);

  const draw = useCallback((r, a, b, { fit = false } = {}) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureLayers(map);
    const A = [a.lng, a.lat], B = [b.lng, b.lat];
    const lines = [], pts = [];
    const nodes = r.hops?.length ? [r.hops[0].from_node, ...r.hops.map(h => h.to_node)] : [r.source_node].filter(Boolean);
    const trunk = nodes.map(nodeCoords).filter(Boolean);
    if (trunk.length >= 2) lines.push({ type: "Feature", properties: { kind: "trunk" }, geometry: { type: "LineString", coordinates: trunk } });
    nodes.forEach(n => { const c = nodeCoords(n); if (c) pts.push({ type: "Feature", properties: { name: n }, geometry: { type: "Point", coordinates: c } }); });
    const start = nodeCoords(r.source_node), end = nodeCoords(r.injection_node);
    if (start && r.first_mile_km > 0) lines.push({ type: "Feature", properties: { kind: "mile", color: END_COLORS.from },
      geometry: { type: "LineString", coordinates: r.first_mile_geometry || [A, start] } });
    if (end && r.last_mile_km > 0) lines.push({ type: "Feature", properties: { kind: "mile", color: END_COLORS.to },
      geometry: { type: "LineString", coordinates: r.last_mile_geometry || [end, B] } });
    map.getSource("ptroute-lines-src").setData({ type: "FeatureCollection", features: lines });
    map.getSource("ptroute-pts-src").setData({ type: "FeatureCollection", features: pts });

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [
      new maplibregl.Marker({ element: endMarker("A", END_COLORS.from) }).setLngLat(A).addTo(map),
      new maplibregl.Marker({ element: endMarker("B", END_COLORS.to) }).setLngLat(B).addTo(map),
    ];

    if (fit) {
      const all = [A, B, ...trunk];
      const bounds = all.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(all[0], all[0]));
      const narrow = window.matchMedia("(max-width: 639px)").matches;
      map.fitBounds(bounds, {
        padding: narrow ? { top: 60, bottom: 320, left: 30, right: 30 } : { top: 70, bottom: 70, left: 400, right: 280 },
        maxZoom: 10, duration: 1200,
      });
    }
  }, [mapRef, nodeCoords]);

  // Recompute whenever both ends (or the MW) are set.
  useEffect(() => {
    if (!open || !from || !to) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    const mwNum = Number(mw) > 0 ? Number(mw) : undefined;

    setRoute({ status: "loading" });
    gridApi.route({ ...routeParams(from, to), mw: mwNum })
      .then(r => {
        if (signal.aborted) return;
        if (r.error) { setRoute({ status: "error", message: r.error }); clearMap(); return; }
        routeRef.current = { r, from, to };
        setRoute({ status: "ready", result: r });
        draw(r, from, to, { fit: true });
      })
      .catch(err => {
        if (signal.aborted) return;
        setRoute({ status: "error", message: err.message.startsWith("No path") ? err.message : `Grid API: ${err.message}` });
        clearMap();
      });

    return () => controller.abort();
  }, [open, from, to, mw, draw, clearMap]);

  // Site stats for each end — only refetched when that end changes.
  useEffect(() => {
    if (!open || !from) { setEnds(e => ({ ...e, from: null })); return; }
    const c = new AbortController();
    runSiteScan({ lat: from.lat, lng: from.lng, offtakers: offtakersRef.current, substations: getSubstations(), signal: c.signal, withSources: false,
      onUpdate: (s) => setEnds(e => ({ ...e, from: s })) });
    return () => c.abort();
  }, [open, from, getSubstations]);
  useEffect(() => {
    if (!open || !to) { setEnds(e => ({ ...e, to: null })); return; }
    const c = new AbortController();
    runSiteScan({ lat: to.lat, lng: to.lng, offtakers: offtakersRef.current, substations: getSubstations(), signal: c.signal, withSources: false,
      onUpdate: (s) => setEnds(e => ({ ...e, to: s })) });
    return () => c.abort();
  }, [open, to, getSubstations]);

  // Theme switches wipe the map style — redraw once our source is gone
  // (same approach as useSiteScan).
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const redraw = () => {
      const cur = routeRef.current;
      if (open && cur && map.isStyleLoaded() && !map.getSource("ptroute-lines-src")) draw(cur.r, cur.from, cur.to);
    };
    map.on("styledata", redraw);
    map.on("idle", redraw);
    return () => { map.off("styledata", redraw); map.off("idle", redraw); };
  }, [mapReady, mapRef, draw, open]);

  const start = useCallback((a = null, b = null) => {
    setFrom(a); setTo(b); setRoute({ status: "idle" }); setOpen(true);
  }, []);
  const close = useCallback(() => {
    abortRef.current?.abort();
    routeRef.current = null;
    clearMap();
    setOpen(false); setFrom(null); setTo(null); setRoute({ status: "idle" });
  }, [clearMap]);
  const swap = useCallback(() => { setFrom(to); setTo(from); }, [from, to]);

  return { open, from, to, mw, route, ends, setFrom, setTo, setMw, swap, start, close };
}
