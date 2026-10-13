import { useState, useEffect, useRef, useCallback } from "react";
import * as turf from "@turf/turf";
import { gridApi } from "@/lib/gridApi";
import { whenStyleReady } from "@/features/explore/whenStyleReady";

// Browse every metered DisCo feeder: the list (refreshed each minute while
// open), the map points, and the selected feeder in 3D — a column at its
// position whose height is its live load. Owns its own "feeders-" layers.
//
// Positions are the feeder's STATION (the feed has no feeder coordinates; see
// server/src/feeders/locate.js). Feeders of one station share a point, so
// they're drawn on a small ring around it purely so each can be picked; the
// card says so.

const REFRESH_MS = 60_000;
const RING_M = 140;          // ring radius for feeders sharing a station
const COLUMN_M = 40;         // radius of the selected feeder's 3D column
const M_PER_MW = 100;        // column height per MW of live load (8 MW ≈ 800 m)
const MIN_COLUMN_M = 60;     // so an off / tiny feeder still reads as a column
export const STATUS_COLOR = { on: "#10b981", shedding: "#f5a623", off: "#ef4444" };
const EMPTY = { type: "FeatureCollection", features: [] };

// Display positions: each feeder at its station, spread on a ring when the
// station has several (stable order, so a feeder never jumps between loads).
export function displayPoints(feeders) {
  const byStation = new Map();
  for (const f of feeders) {
    if (!f.position) continue;
    const k = `${f.position.lat},${f.position.lng}`;
    if (!byStation.has(k)) byStation.set(k, []);
    byStation.get(k).push(f);
  }
  const out = new Map();
  for (const list of byStation.values()) {
    list.sort((a, b) => a.id - b.id);
    list.forEach((f, i) => {
      const at = [f.position.lng, f.position.lat];
      out.set(f.id, list.length === 1 ? at
        : turf.destination(at, RING_M / 1000 * (1 + Math.floor(i / 12) * 0.8), (360 * (i % 12)) / Math.min(12, list.length), { units: "kilometers" }).geometry.coordinates);
    });
  }
  return out;
}

function ensureLayers(map) {
  if (map.getSource("feeders-src")) return;
  map.addSource("feeders-src", { type: "geojson", data: EMPTY });
  map.addSource("feeders-sel-src", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "feeders-pts", type: "circle", source: "feeders-src",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 10, 4.5, 14, 7],
      "circle-color": ["match", ["get", "status"], "on", STATUS_COLOR.on, "shedding", STATUS_COLOR.shedding, STATUS_COLOR.off],
      "circle-stroke-color": "#0b1220", "circle-stroke-width": 1,
      "circle-opacity": ["case", ["get", "approx"], 0.75, 1],
    } });
  map.addLayer({ id: "feeders-column", type: "fill-extrusion", source: "feeders-sel-src", filter: ["==", ["get", "kind"], "column"],
    paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "height"], "fill-extrusion-opacity": 0.85 } });
  map.addLayer({ id: "feeders-sel-ring", type: "circle", source: "feeders-sel-src", filter: ["==", ["get", "kind"], "point"],
    paint: { "circle-radius": 11, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 } });
  map.addLayer({ id: "feeders-sel-label", type: "symbol", source: "feeders-sel-src", filter: ["==", ["get", "kind"], "point"],
    layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 11.5, "text-offset": [0, 1.4], "text-anchor": "top", "text-max-width": 14 },
    paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.8)", "text-halo-width": 1.6 } });
}

export default function useFeederBrowser({ mapRef, mapReady }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState({ status: "idle" });       // idle | loading | ready | error
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState({ status: "idle" });
  const pointsRef = useRef(new Map());
  const listRef = useRef(null);
  const selRef = useRef(null);

  const draw = useCallback(() => {
    const map = mapRef.current, d = listRef.current;
    if (!map || !d) return;
    whenStyleReady(map, "feeders", () => {
      ensureLayers(map);
      const pts = displayPoints(d.feeders);
      pointsRef.current = pts;
      map.getSource("feeders-src").setData({ type: "FeatureCollection", features: d.feeders.filter(f => pts.has(f.id)).map(f => ({
        type: "Feature", id: f.id, properties: { id: f.id, status: f.status, approx: f.position.precision === "area" },
        geometry: { type: "Point", coordinates: pts.get(f.id) },
      })) });
      const sel = d.feeders.find(f => f.id === selRef.current);
      const at = sel && pts.get(sel.id);
      map.getSource("feeders-sel-src").setData(!at ? EMPTY : { type: "FeatureCollection", features: [
        { type: "Feature", properties: { kind: "point", label: sel.name }, geometry: { type: "Point", coordinates: at } },
        { type: "Feature", properties: { kind: "column", color: STATUS_COLOR[sel.status], height: Math.max(MIN_COLUMN_M, (sel.liveMw || 0) * M_PER_MW) },
          geometry: turf.circle(at, COLUMN_M / 1000, { steps: 24, units: "kilometers" }).geometry },
      ] });
    });
  }, [mapRef]);

  // The list: fetched on open, refreshed each minute while open.
  useEffect(() => {
    if (!open) return;
    let live = true;
    const load = () => gridApi.feeders()
      .then(d => {
        if (!live) return;
        if (!d.available) { setList({ status: "error", message: d.reason || "No feeder data yet." }); return; }
        listRef.current = d; setList({ status: "ready", data: d }); draw();
      })
      .catch(e => live && setList(l => (l.status === "ready" ? l : { status: "error", message: e.message })));
    setList(l => (l.status === "ready" ? l : { status: "loading" }));
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(t); };
  }, [open, draw]);

  // Selected feeder's detail (hourly history, on/off changes).
  useEffect(() => {
    if (!open || selectedId == null) { setDetail({ status: "idle" }); return; }
    const c = new AbortController();
    setDetail({ status: "loading" });
    gridApi.feeder(selectedId, { signal: c.signal })
      .then(d => setDetail({ status: "ready", data: d }))
      .catch(e => { if (!c.signal.aborted) setDetail({ status: "error", message: e.message }); });
    return () => c.abort();
  }, [open, selectedId, list.status === "ready" && list.data.capturedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = useCallback((id) => {
    selRef.current = id;
    setSelectedId(id);
    draw();
    const map = mapRef.current, at = pointsRef.current.get(id);
    if (map && at) {
      const narrow = window.matchMedia("(max-width: 639px)").matches;
      map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 13), pitch: 55, bearing: map.getBearing() || -15, duration: 1400,
        padding: narrow ? { top: 40, bottom: 320, left: 0, right: 0 } : { top: 0, bottom: 0, left: 380, right: 0 } });
    }
  }, [mapRef, draw]);

  // Clicking a feeder point on the map selects it.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const onClick = (e) => { const id = e.features?.[0]?.properties?.id; if (id != null) select(Number(id)); };
    const enter = () => { map.getCanvas().style.cursor = "pointer"; };
    const leave = () => { map.getCanvas().style.cursor = ""; };
    map.on("click", "feeders-pts", onClick); map.on("mouseenter", "feeders-pts", enter); map.on("mouseleave", "feeders-pts", leave);
    return () => { map.off("click", "feeders-pts", onClick); map.off("mouseenter", "feeders-pts", enter); map.off("mouseleave", "feeders-pts", leave); };
  }, [mapReady, mapRef, select]);

  // Theme switch wipes the style — redraw once our source is gone.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const redraw = () => { if (listRef.current && open && !map.getSource("feeders-src")) draw(); };
    map.on("styledata", redraw); map.on("idle", redraw);
    return () => { map.off("styledata", redraw); map.off("idle", redraw); };
  }, [mapReady, mapRef, draw, open]);

  const close = useCallback(() => {
    setOpen(false); setSelectedId(null); selRef.current = null; listRef.current = null;
    setList({ status: "idle" });
    const map = mapRef.current;
    map?.getSource("feeders-src")?.setData(EMPTY);
    map?.getSource("feeders-sel-src")?.setData(EMPTY);
    if (map && map.getPitch() > 5) map.easeTo({ pitch: 0, duration: 700 });
  }, [mapRef]);

  return { open, start: () => setOpen(true), close, list, selectedId, select, detail };
}
