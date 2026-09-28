import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import { runSiteScan } from "./siteScan";

// Map side of the Explore scanner: arming the crosshair, catching the scan
// click, and drawing the pulse, distance rings and source arcs. Owns its own
// sources/layers (prefixed "scan-") so it never touches useNigeriaMap's.

export const RING_KM = [5, 15, 30];
export const RANK_COLORS = ["#10b981", "#f5a623", "#94a3b8"]; // #1 green, #2 amber, #3 slate
const DRAG_TOLERANCE_PX = 5;

// Curved arc between two points (quadratic bezier bowed sideways) so the
// fan of lines to the top sources reads as "reach", not as real line routes.
function arc(from, to, bow = 0.18, steps = 64) {
  const [x1, y1] = from, [x2, y2] = to;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const cx = mx - dy * bow, cy = my + dx * bow;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2]);
  }
  return pts;
}

const EMPTY = { type: "FeatureCollection", features: [] };

function ensureLayers(map) {
  if (map.getSource("scan-rings-src")) return;
  map.addSource("scan-rings-src", { type: "geojson", data: EMPTY });
  map.addSource("scan-arcs-src",  { type: "geojson", data: EMPTY });
  map.addSource("scan-pts-src",   { type: "geojson", data: EMPTY });
  map.addLayer({ id: "scan-rings", type: "line", source: "scan-rings-src",
    paint: { "line-color": "#f5a623", "line-width": 1.4, "line-opacity": 0.75, "line-dasharray": [2, 2] } });
  map.addLayer({ id: "scan-ring-labels", type: "symbol", source: "scan-rings-src", filter: ["==", ["get", "kind"], "label"],
    layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 10, "text-offset": [0, -0.7] },
    paint: { "text-color": "#f5a623", "text-halo-color": "rgba(0,0,0,0.6)", "text-halo-width": 1.5 } });
  map.addLayer({ id: "scan-lastmile", type: "line", source: "scan-arcs-src", filter: ["==", ["get", "kind"], "lastmile"],
    paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.85, "line-dasharray": [1, 1.5] } });
  map.addLayer({ id: "scan-arcs-glow", type: "line", source: "scan-arcs-src", filter: ["==", ["get", "kind"], "arc"],
    layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 7, "line-opacity": 0.18, "line-blur": 3 } });
  map.addLayer({ id: "scan-arcs", type: "line", source: "scan-arcs-src", filter: ["==", ["get", "kind"], "arc"],
    layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.95, "line-dasharray": [0, 4, 3] } });
  map.addLayer({ id: "scan-pts", type: "circle", source: "scan-pts-src",
    paint: {
      "circle-radius": ["case", ["==", ["get", "kind"], "substation"], 7, 6],
      "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 2,
    } });
  map.addLayer({ id: "scan-pt-labels", type: "symbol", source: "scan-pts-src",
    layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top" },
    paint: { "text-color": ["get", "color"], "text-halo-color": "rgba(0,0,0,0.75)", "text-halo-width": 1.6 } });
}

// Marching-ants dash sequence for the arcs (the standard MapLibre trick:
// cycle line-dasharray through offsets each frame).
const DASH_SEQ = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];

export default function useSiteScan({ mapRef, mapReady, locate, offtakers, getSubstations }) {
  const [armed, setArmed] = useState(false);
  const [scan, setScan] = useState(null);          // latest runSiteScan result (partial while loading)
  const scanRef = useRef(null);
  const abortRef = useRef(null);
  const pulseRef = useRef(null);
  const animRef = useRef(null);
  const offtakersRef = useRef(offtakers);
  offtakersRef.current = offtakers;

  const stopAnim = () => { cancelAnimationFrame(animRef.current); animRef.current = null; };

  const draw = useCallback((s) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureLayers(map);
    const center = [s.lng, s.lat];

    const rings = RING_KM.flatMap(km => {
      const circle = turf.circle(center, km, { steps: 96, units: "kilometers" });
      const top = turf.destination(turf.point(center), km, 0, { units: "kilometers" });
      return [
        { type: "Feature", properties: { kind: "ring" }, geometry: { type: "LineString", coordinates: circle.geometry.coordinates[0] } },
        { type: "Feature", properties: { kind: "label", label: `${km} km` }, geometry: top.geometry },
      ];
    });
    map.getSource("scan-rings-src").setData({ type: "FeatureCollection", features: rings });

    const arcs = [], pts = [];
    const src = s.sources;
    if (src?.status === "ready") {
      src.top.forEach((r, i) => {
        const g = locate?.(r.genco);
        if (!g) return;
        const color = RANK_COLORS[i];
        arcs.push({ type: "Feature", properties: { kind: "arc", color }, geometry: { type: "LineString", coordinates: arc(center, [g.lon, g.lat], i % 2 ? -0.18 : 0.18) } });
        pts.push({ type: "Feature", properties: { kind: "genco", color, label: `${i + 1} · ${r.genco}` }, geometry: { type: "Point", coordinates: [g.lon, g.lat] } });
      });
      const sub = locate?.(src.injectionNode, "substation");
      if (sub) {
        const lastMile = src.lastMileGeometry || [center, [sub.lon, sub.lat]];
        arcs.push({ type: "Feature", properties: { kind: "lastmile" }, geometry: { type: "LineString", coordinates: lastMile } });
        pts.push({ type: "Feature", properties: { kind: "substation", color: "#ffffff", label: src.injectionNode }, geometry: { type: "Point", coordinates: [sub.lon, sub.lat] } });
      }
    }
    map.getSource("scan-arcs-src").setData({ type: "FeatureCollection", features: arcs });
    map.getSource("scan-pts-src").setData({ type: "FeatureCollection", features: pts });

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (arcs.some(a => a.properties.kind === "arc") && !animRef.current && !reduceMotion) {
      let step = 0, last = 0;
      const tick = (t) => {
        if (t - last > 55) {
          last = t; step = (step + 1) % DASH_SEQ.length;
          if (map.getLayer("scan-arcs")) map.setPaintProperty("scan-arcs", "line-dasharray", DASH_SEQ[step]);
        }
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    }
  }, [mapRef, locate]);

  const frame = useCallback((s) => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [[s.lng, s.lat]];
    const ring = turf.bbox(turf.circle([s.lng, s.lat], RING_KM[RING_KM.length - 1], { units: "kilometers" }));
    pts.push([ring[0], ring[1]], [ring[2], ring[3]]);
    s.sources?.top?.forEach(r => { const g = locate?.(r.genco); if (g) pts.push([g.lon, g.lat]); });
    const bounds = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
    const narrow = window.matchMedia("(max-width: 639px)").matches;
    map.fitBounds(bounds, {
      padding: narrow ? { top: 60, bottom: 280, left: 30, right: 30 } : { top: 60, bottom: 60, left: 380, right: 60 },
      maxZoom: 10, duration: 1200,
    });
  }, [mapRef, locate]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    stopAnim();
    pulseRef.current?.remove(); pulseRef.current = null;
    const map = mapRef.current;
    ["scan-rings-src", "scan-arcs-src", "scan-pts-src"].forEach(id => map?.getSource(id)?.setData(EMPTY));
    scanRef.current = null;
    setScan(null);
  }, [mapRef]);

  const scanAt = useCallback((lat, lng, label = null) => {
    const map = mapRef.current;
    if (!map) return;
    abortRef.current?.abort();
    stopAnim();
    const controller = new AbortController();
    abortRef.current = controller;
    setArmed(false);

    pulseRef.current?.remove();
    const el = document.createElement("div");
    el.className = "scan-pulse";
    el.innerHTML = "<span></span><span></span><span></span><i></i>";
    pulseRef.current = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);

    map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 8), duration: 700 });
    let framed = false;
    runSiteScan({
      lat, lng, offtakers: offtakersRef.current, substations: getSubstations?.(), signal: controller.signal,
      onUpdate: (partial) => {
        if (controller.signal.aborted) return;
        const s = { ...partial, label };
        scanRef.current = s;
        setScan(s);
        draw(s);
        if (!framed && s.sources?.status === "ready") { framed = true; frame(s); }
      },
    });
  }, [mapRef, draw, frame, getSubstations]);

  // Scan clicks are caught at the window in the capture phase, before
  // MapLibre sees them — so while armed, a click on a GenCo or substation
  // scans that spot instead of also opening its popup or loading it into
  // the calculator. Drags (pans) are ignored.
  useEffect(() => {
    const map = mapRef.current;
    if (!armed || !map) return;
    const canvas = map.getCanvas();
    const container = map.getContainer();
    container.classList.add("scan-armed");
    let down = null;
    const onDown = (e) => { if (e.target === canvas) down = { x: e.clientX, y: e.clientY }; };
    const onClick = (e) => {
      if (e.target !== canvas) return;
      e.stopPropagation(); e.preventDefault();
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_TOLERANCE_PX) return;
      const rect = canvas.getBoundingClientRect();
      const { lng, lat } = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
      scanAt(lat, lng);
    };
    const onKey = (e) => { if (e.key === "Escape") setArmed(false); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      container.classList.remove("scan-armed");
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [armed, mapRef, scanAt]);

  // A theme switch replaces the whole map style, wiping our layers. The app
  // notes "style.load" doesn't reliably fire for setStyle() in this MapLibre
  // version, so watch styledata/idle and redraw once our source is gone.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const redraw = () => {
      if (scanRef.current && map.isStyleLoaded() && !map.getSource("scan-rings-src")) { stopAnim(); draw(scanRef.current); }
    };
    map.on("styledata", redraw);
    map.on("idle", redraw);
    return () => { map.off("styledata", redraw); map.off("idle", redraw); };
  }, [mapReady, mapRef, draw]);

  useEffect(() => () => { abortRef.current?.abort(); stopAnim(); }, []);

  return { armed, arm: () => setArmed(true), disarm: () => setArmed(false), scan, scanAt, clear };
}
