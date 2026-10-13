import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { CI_CUSTOMERS } from "@/data";
import { SUBSTATION_STATUS } from "@/data/legend";
import { whenStyleReady } from "./whenStyleReady";
import { gridIndex, customerList, customersNear } from "./substationCustomers";

// Substation focus: pick a substation (map click or the command palette)
// and see the customers nearest to it. Draws its own "subfocus-" layers;
// never touches useNigeriaMap's.

const EMPTY = { type: "FeatureCollection", features: [] };
const COLOR = "#38bdf8";
// The map's own substation rings, one layer per status (see useNigeriaMap).
const BASE_LAYERS = SUBSTATION_STATUS.filter(s => s.key !== "ongoing-nipp").map(s => `grid-sub-ring-outer-${s.key}`);

function ensureLayers(map) {
  if (map.getSource("subfocus-src")) return;
  map.addSource("subfocus-src", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "subfocus-links", type: "line", source: "subfocus-src", filter: ["==", ["get", "kind"], "link"],
    paint: { "line-color": COLOR, "line-width": ["case", ["get", "nearestHere"], 1.8, 1], "line-opacity": ["case", ["get", "nearestHere"], 0.85, 0.45], "line-dasharray": [2, 2] } });
  map.addLayer({ id: "subfocus-customers", type: "circle", source: "subfocus-src", filter: ["==", ["get", "kind"], "customer"],
    paint: { "circle-radius": 5, "circle-color": ["case", ["get", "nearestHere"], COLOR, "rgba(0,0,0,0.4)"], "circle-stroke-color": COLOR, "circle-stroke-width": 1.5 } });
  map.addLayer({ id: "subfocus-sub", type: "circle", source: "subfocus-src", filter: ["==", ["get", "kind"], "substation"],
    paint: { "circle-radius": 9, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": COLOR, "circle-stroke-width": 3 } });
  map.addLayer({ id: "subfocus-labels", type: "symbol", source: "subfocus-src", filter: ["!=", ["get", "kind"], "link"],
    layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": ["case", ["==", ["get", "kind"], "substation"], 12, 10],
              "text-offset": [0, 1.2], "text-anchor": "top", "text-optional": true },
    paint: { "text-color": COLOR, "text-halo-color": "rgba(0,0,0,0.75)", "text-halo-width": 1.5 } });
}

export default function useSubstationFocus({ mapRef, mapReady, getSubstations, getEdges, offtakers, onBaseClick }) {
  const [focus, setFocus] = useState(null);   // { sub, connected, listed, near }
  const focusRef = useRef(null);
  const onBaseClickRef = useRef(onBaseClick);
  onBaseClickRef.current = onBaseClick;

  const draw = useCallback((f) => {
    const map = mapRef.current;
    if (!map) return;
    whenStyleReady(map, "subfocus", () => {
      ensureLayers(map);
      const at = [f.sub.lon, f.sub.lat];
      const features = [{ type: "Feature", properties: { kind: "substation", label: f.sub.name }, geometry: { type: "Point", coordinates: at } }];
      f.near.rows.forEach(c => {
        features.push({ type: "Feature", properties: { kind: "link", nearestHere: c.nearestHere }, geometry: { type: "LineString", coordinates: [at, [c.lng, c.lat]] } });
        features.push({ type: "Feature", properties: { kind: "customer", nearestHere: c.nearestHere, label: c.name }, geometry: { type: "Point", coordinates: [c.lng, c.lat] } });
      });
      map.getSource("subfocus-src").setData({ type: "FeatureCollection", features });
    });
  }, [mapRef]);

  const open = useCallback((name) => {
    const map = mapRef.current;
    const sub = getSubstations().find(s => s.name === name);
    if (!map || !sub) return;
    const grid = gridIndex(getSubstations(), getEdges());
    const near = customersNear(sub, grid, customerList(offtakers, CI_CUSTOMERS));
    const f = { sub, connected: grid.isConnected(sub.name), listed: !!sub.is_injection, near };
    focusRef.current = f;
    setFocus(f);
    draw(f);
    const pts = [[sub.lon, sub.lat], ...near.rows.map(c => [c.lng, c.lat])];
    const bounds = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
    const narrow = window.matchMedia("(max-width: 639px)").matches;
    map.fitBounds(bounds, {
      padding: narrow ? { top: 60, bottom: 300, left: 30, right: 30 } : { top: 70, bottom: 70, left: 400, right: 280 },
      maxZoom: 10, duration: 1000,
    });
  }, [mapRef, getSubstations, getEdges, offtakers, draw]);

  const close = useCallback(() => {
    focusRef.current = null;
    setFocus(null);
    mapRef.current?.getSource("subfocus-src")?.setData(EMPTY);
  }, [mapRef]);

  // Clicks on the map's own substation rings (when that layer is on) go to
  // the app, which decides: pick it for an open scan, or focus it.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const onClick = (e) => { const n = e.features?.[0]?.properties?.name; if (n) onBaseClickRef.current?.(n); };
    BASE_LAYERS.forEach(id => map.on("click", id, onClick));
    return () => BASE_LAYERS.forEach(id => map.off("click", id, onClick));
  }, [mapReady, mapRef]);

  // Theme switches wipe the style — redraw once our source is gone.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const redraw = () => { if (focusRef.current && !map.getSource("subfocus-src")) draw(focusRef.current); };
    map.on("styledata", redraw);
    map.on("idle", redraw);
    return () => { map.off("styledata", redraw); map.off("idle", redraw); };
  }, [mapReady, mapRef, draw]);

  return { focus, open, close };
}
