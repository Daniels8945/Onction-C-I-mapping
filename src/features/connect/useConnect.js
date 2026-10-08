import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import { gridApi } from "@/lib/gridApi";
import { whenStyleReady } from "@/features/explore/whenStyleReady";

// The Connect workflow — "a customer is here; what infrastructure could serve
// them?": locate the customer (search result, dropped pin, or dragged pin),
// ask /api/connect for the infrastructure within a radius + a planning
// indication, and draw customer ← substation the moment one is chosen, with
// energy flowing toward the customer. Optional miniature 3D layer
// (connect3d.js, lazy-loaded). Owns "connect-" layers, the customer marker
// and the hover tooltip; touches nothing else on the map.

export const STATUS_COLOR = { existing: "#38bdf8", ongoing: "#a78bfa", proposed: "#a78bfa" };
export const LINE_STATUS_COLOR = { existing: "#0ea5e9", ongoing: "#9ca3af", proposed: "#ef4444" };
export const RADIUS_OPTIONS = [10, 25, 50, 100, 200];
const LINE = "#f5a623";
const EMPTY = { type: "FeatureCollection", features: [] };
const DRAG_TOLERANCE_PX = 5;
const THREE_D_KEY = "gis:connect-3d";
const VIEW_KEY = "gis:connect-view";

// What the user has chosen to SEE — presentation only. Every control filters
// what's drawn from the assessment; none of them changes the assessment, the
// selection's numbers or what the API is asked. Levels, which compose:
//   global     All on / All off / Reset (sets the categories)
//   category   kv330, kv132, substations, customer · connection, flow, labels, radius
//   individual hidden: substations hidden one by one (this analysis only)
//   selection  focus: only the chosen connection, its substation and its lines
export const VIEW_DEFAULTS = { kv330: true, kv132: true, substations: true, customer: true, connection: true, flow: true, labels: true, radius: true,
  flowPaused: false, focus: false, hidden: [] };
export const VIEW_CATEGORIES = ["kv330", "kv132", "substations", "customer", "connection", "flow", "labels", "radius"];
function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
    if (v && typeof v === "object") {
      const out = { ...VIEW_DEFAULTS };
      for (const k of [...VIEW_CATEGORIES, "flowPaused", "focus"]) if (typeof v[k] === "boolean") out[k] = v[k];
      return out;
    }
  } catch { /* storage blocked or corrupt */ }
  return { ...VIEW_DEFAULTS };
}
function saveView(v) {
  try { const { hidden, ...keep } = v; localStorage.setItem(VIEW_KEY, JSON.stringify(keep)); } catch { /* storage blocked */ }
}

// Apply the view to the 2D connect- layers: whole layers by visibility,
// individual features by filter. Data sources are untouched. "Only this
// connection" applies only while there is one — never a blank map.
function applyView2D(map, view, hasSelection) {
  if (!map?.getLayer("connect-cands")) return;
  const v = { ...view, focus: view.focus && hasSelection };
  const vis = (id, on) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none"); };
  const kv = [...(v.kv330 ? [330] : []), ...(v.kv132 ? [132] : [])];
  const lineF = ["all", ["in", ["get", "kv"], ["literal", kv]], ...(v.focus ? [["get", "attached"]] : [])];
  map.setFilter("connect-lines", lineF);
  map.setFilter("connect-lines-hit", lineF);
  map.setFilter("connect-lines-glow", [...lineF, ["get", "focused"]]);
  const candF = ["all", ["!", ["in", ["get", "name"], ["literal", v.hidden]]], ...(v.focus ? [["get", "selected"]] : [])];
  map.setFilter("connect-cands", candF);
  map.setFilter("connect-cand-labels", candF);
  vis("connect-cands", v.substations);
  vis("connect-cand-labels", v.substations && v.labels);
  ["connect-line", "connect-line-glow", "connect-road"].forEach(id => vis(id, v.connection));
  vis("connect-line-label", v.connection && v.labels);
  ["connect-radius", "connect-radius-fill"].forEach(id => vis(id, v.radius));
  vis("connect-radius-label", v.radius && v.labels);
}
const lineKey = (l) => `${l.from_node}|${l.to_node}`;
// Is `b` still the customer `a` was located at? Responses are matched by
// position, not object: filling in the address (reverse geocode) replaces
// the object but not the place, and must not discard an assessment in flight.
const samePlace = (a, b) => !!a && !!b && a.lat === b.lat && a.lng === b.lng;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// "Ants" for the flowing connection line: the dash pattern stepped along.
const DASH_STEPS = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];

function ensureLayers(map) {
  if (map.getSource("connect-cands-src")) return;
  map.addSource("connect-cands-src", { type: "geojson", data: EMPTY });
  map.addSource("connect-line-src", { type: "geojson", data: EMPTY });
  map.addSource("connect-radius-src", { type: "geojson", data: EMPTY });
  map.addSource("connect-lines-src", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "connect-radius-fill", type: "fill", source: "connect-radius-src", paint: { "fill-color": LINE, "fill-opacity": 0.035 } });
  map.addLayer({ id: "connect-radius", type: "line", source: "connect-radius-src",
    paint: { "line-color": LINE, "line-width": 1.2, "line-opacity": 0.55, "line-dasharray": [3, 3] } });
  map.addLayer({ id: "connect-radius-label", type: "symbol", source: "connect-radius-src",
    layout: { "symbol-placement": "line", "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 10.5, "symbol-spacing": 400 },
    paint: { "text-color": LINE, "text-halo-color": "rgba(0,0,0,0.8)", "text-halo-width": 1.6 } });
  // Nearby corridors, coloured by status like the legend; the focused one bright.
  map.addLayer({ id: "connect-lines-glow", type: "line", source: "connect-lines-src", filter: ["get", "focused"],
    layout: { "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.25, "line-blur": 3 } });
  map.addLayer({ id: "connect-lines", type: "line", source: "connect-lines-src", layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "focused"], 4.5, 2.6],
      "line-opacity": ["case", ["get", "focused"], 1, ["==", ["get", "status"], "existing"], 0.85, 0.55] } });
  // Wide invisible hit area so a 2-px line is easy to hover.
  map.addLayer({ id: "connect-lines-hit", type: "line", source: "connect-lines-src", paint: { "line-color": "#000", "line-width": 14, "line-opacity": 0.001 } });
  map.addLayer({ id: "connect-road", type: "line", source: "connect-line-src", filter: ["==", ["get", "kind"], "road"],
    layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.55 } });
  map.addLayer({ id: "connect-line-glow", type: "line", source: "connect-line-src", filter: ["==", ["get", "kind"], "straight"],
    layout: { "line-cap": "round" }, paint: { "line-color": LINE, "line-width": 9, "line-opacity": 0.22, "line-blur": 3 } });
  map.addLayer({ id: "connect-line", type: "line", source: "connect-line-src", filter: ["==", ["get", "kind"], "straight"],
    layout: { "line-cap": "round" }, paint: { "line-color": LINE, "line-width": 3, "line-dasharray": [0, 4, 3] } });
  map.addLayer({ id: "connect-line-label", type: "symbol", source: "connect-line-src", filter: ["==", ["get", "kind"], "straight"],
    layout: { "symbol-placement": "line-center", "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12.5,
      "text-offset": [0, -0.9], "text-keep-upright": true, "text-allow-overlap": true },
    paint: { "text-color": LINE, "text-halo-color": "rgba(0,0,0,0.85)", "text-halo-width": 2 } });
  map.addLayer({ id: "connect-cands", type: "circle", source: "connect-cands-src",
    paint: {
      "circle-radius": ["case", ["get", "selected"], 9, 6.5],
      "circle-color": ["case", ["get", "supply_point"], ["get", "color"], "rgba(0,0,0,0.35)"],
      "circle-stroke-color": ["case", ["get", "selected"], LINE, ["get", "color"]],
      "circle-stroke-width": ["case", ["get", "selected"], 3.5, 2],
      // With a connection chosen, the other candidates step back.
      "circle-opacity": ["case", ["get", "selected"], 1, ["get", "dim"], 0.4, ["==", ["get", "status"], "existing"], 1, 0.65],
      "circle-stroke-opacity": ["case", ["get", "selected"], 1, ["get", "dim"], 0.45, 1],
    } });
  map.addLayer({ id: "connect-cand-labels", type: "symbol", source: "connect-cands-src",
    layout: { "text-field": ["concat", ["to-string", ["get", "rank"]], " · ", ["get", "name"]], "text-font": ["Noto Sans Bold"],
      "text-size": ["case", ["get", "selected"], 12.5, 10.5], "text-offset": [0, 1.25], "text-anchor": "top", "text-optional": true },
    paint: { "text-color": ["case", ["get", "selected"], LINE, "#e2e8f0"], "text-halo-color": "rgba(0,0,0,0.8)", "text-halo-width": 1.6,
      "text-opacity": ["case", ["get", "selected"], 1, ["get", "dim"], 0.55, 1] } });
}

function customerPin(label) {
  const el = document.createElement("div");
  el.className = "customer-pin";
  el.innerHTML = `<div class="customer-pin__label"></div><div class="customer-pin__head"></div>`;
  el.querySelector(".customer-pin__label").textContent = label;
  el.title = "Customer / potential offtaker — drag to the exact site";
  return el;
}

const kvText = (kv) => (kv >= 330 ? "330/132 kV" : kv >= 132 ? "132/33 kV" : `${kv} kV`);
const statusText = (s) => (s === "existing" ? "Existing" : s === "ongoing" ? "On-going — not yet in service" : "Proposed — not built");

// The hover card's lines for a hit: what it is, and why it matters here.
export function describeHit(hit, { customer, label, selected }) {
  if (!hit) return null;
  if (hit.kind === "substation") {
    const c = hit.candidate;
    return {
      title: c.name, kind: `Transmission substation · ${kvText(c.voltage_kv)}`,
      rows: [statusText(c.status), c.supply_point ? "Grid supply point" : c.status === "existing" ? "Not a customer supply point in the data" : null,
        `${c.distance_km} km from the customer`, [c.lga, c.state].filter(Boolean).join(", ")].filter(Boolean),
      hint: c.name === selected ? "The connection you're evaluating" : "Click to evaluate this connection",
    };
  }
  if (hit.kind === "line") {
    const l = hit.line;
    return {
      title: `${l.from_node} – ${l.to_node}`, kind: `${l.voltage_kv} kV transmission line`,
      rows: [statusText(l.status), `${l.line_km} km long · passes ~${l.distance_km} km from the customer`,
        l.crosses_state ? `Crosses ${l.from_state} → ${l.to_state}` : [l.from_state].filter(Boolean).join(""),
        "Voltage inferred from its substations"].filter(Boolean),
      hint: "Click for details",
    };
  }
  if (hit.kind === "customer") {
    return { title: label || customer?.name || "Customer", kind: "Customer / potential offtaker",
      rows: [customer?.address, [customer?.lga, customer?.state].filter(Boolean).join(", ")].filter(Boolean), hint: "Drag the pin to the exact site" };
  }
  return null;
}

function tooltipEl() {
  const el = document.createElement("div");
  el.className = "connect-tip";
  el.setAttribute("role", "tooltip");
  el.dataset.testid = "connect-tooltip";
  el.style.display = "none";
  return el;
}
function fillTooltip(el, d) {
  el.replaceChildren();
  const add = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; n.textContent = text; el.appendChild(n); };
  add("p", "connect-tip__kind", d.kind);
  add("p", "connect-tip__title", d.title);
  d.rows.forEach(r => add("p", "connect-tip__row", r));
  if (d.hint) add("p", "connect-tip__hint", d.hint);
}

const initial3D = () => {
  try { const v = localStorage.getItem(THREE_D_KEY); if (v != null) return v === "1"; } catch { /* storage blocked */ }
  return !window.matchMedia("(max-width: 639px)").matches; // phones start flat
};

export default function useConnect({ mapRef, mapReady }) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomerState] = useState(null);  // { name, address, state, lga, lat, lng, confidence, confidence_reason, precision, source, type_label, confirmed }
  const [label, setLabel] = useState("");
  const [preferState, setPreferState] = useState(true);   // prefer infrastructure in the customer's state
  const [radiusKm, setRadiusKm] = useState(50);
  const [assessment, setAssessment] = useState({ status: "idle" });
  const [selected, setSelected] = useState(null);
  const [focusedLine, setFocusedLine] = useState(null);   // a nearby corridor the user clicked
  const [line, setLine] = useState(null);                 // /api/connect/line result for `selected`
  const [dropping, setDropping] = useState(false);
  const [threeD, setThreeD] = useState(initial3D);
  const [threeDStatus, setThreeDStatus] = useState("off"); // off | loading | on | error
  const [view, setViewState] = useState(loadView);
  const [flowResets, setFlowResets] = useState(0);

  const markerRef = useRef(null);
  const customerRef = useRef(null);
  const assessRef = useRef(null);
  const selectedRef = useRef(null);
  const focusedRef = useRef(null);
  const radiusRef = useRef(radiusKm);
  const labelRef = useRef(label);
  const sceneRef = useRef(null);       // connect3d instance
  const tipRef = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  customerRef.current = customer; assessRef.current = assessment.data; selectedRef.current = selected;
  focusedRef.current = focusedLine; radiusRef.current = radiusKm; labelRef.current = label;

  // ── hover tooltip (2D layers and 3D models share it) ─────────────────
  const showTip = useCallback((hit, point) => {
    const map = mapRef.current;
    if (!map) return;
    if (!tipRef.current) { tipRef.current = tooltipEl(); map.getContainer().appendChild(tipRef.current); }
    const el = tipRef.current;
    const d = describeHit(hit, { customer: customerRef.current, label: labelRef.current, selected: selectedRef.current });
    if (!d || !point) { el.style.display = "none"; return; }
    fillTooltip(el, d);
    el.style.display = "block";
    const w = map.getContainer().clientWidth;
    el.style.left = `${Math.min(point.x + 14, w - 250)}px`;
    el.style.top = `${point.y + 14}px`;
  }, [mapRef]);

  // ── drawing ──────────────────────────────────────────────────────────
  const drawCandidates = useCallback(() => {
    const map = mapRef.current, a = assessRef.current;
    if (!map) return;
    whenStyleReady(map, "connect-cands", () => {
      ensureLayers(map);
      const sel = selectedRef.current;
      const feats = (a?.candidates || []).map((c, i) => ({
        type: "Feature",
        properties: { name: c.name, rank: i + 1, status: c.status, supply_point: c.supply_point, selected: c.name === sel, dim: !!sel && c.name !== sel,
          color: STATUS_COLOR[c.status] || "#94a3b8" },
        geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      }));
      map.getSource("connect-cands-src").setData({ type: "FeatureCollection", features: feats });
      applyView2D(map, viewRef.current, !!selectedRef.current);
    });
  }, [mapRef]);

  const drawContext = useCallback(() => {
    const map = mapRef.current, a = assessRef.current, cust = customerRef.current;
    if (!map) return;
    whenStyleReady(map, "connect-context", () => {
      ensureLayers(map);
      const r = a?.radius_km ?? radiusRef.current;
      map.getSource("connect-radius-src").setData(cust ? {
        type: "FeatureCollection",
        features: [{ ...turf.circle([cust.lng, cust.lat], r, { units: "kilometers", steps: 128 }), properties: { label: `${r} km search radius` } }],
      } : EMPTY);
      const f = focusedRef.current;
      map.getSource("connect-lines-src").setData({
        type: "FeatureCollection",
        features: (a?.nearby_lines || []).map(l => ({
          type: "Feature",
          properties: { key: lineKey(l), status: l.status, color: LINE_STATUS_COLOR[l.status] || "#94a3b8", focused: !!f && lineKey(l) === lineKey(f),
            kv: l.voltage_kv >= 330 ? 330 : 132, attached: !!selectedRef.current && (l.from_node === selectedRef.current || l.to_node === selectedRef.current) },
          geometry: { type: "LineString", coordinates: l.coordinates },
        })),
      });
      applyView2D(map, viewRef.current, !!selectedRef.current);
    });
  }, [mapRef]);

  // Substation → customer, so the dash flow runs toward the customer.
  const drawLine = useCallback((cust, cand, road) => {
    const map = mapRef.current;
    if (!map) return;
    whenStyleReady(map, "connect-line", () => {
      ensureLayers(map);
      const feats = [];
      if (cust && cand) {
        feats.push({ type: "Feature", properties: { kind: "straight", label: `${cand.distance_km} km` },
          geometry: { type: "LineString", coordinates: [[cand.lon, cand.lat], [cust.lng, cust.lat]] } });
        if (road?.road_geometry) feats.push({ type: "Feature", properties: { kind: "road" }, geometry: { type: "LineString", coordinates: road.road_geometry } });
      }
      map.getSource("connect-line-src").setData({ type: "FeatureCollection", features: feats });
      applyView2D(map, viewRef.current, !!selectedRef.current);
    });
  }, [mapRef]);

  const frame = useCallback((cust, cand, { radius } = {}) => {
    const map = mapRef.current;
    if (!map || !cust) return;
    const narrow = window.matchMedia("(max-width: 639px)").matches;
    const padding = narrow ? { top: 90, bottom: 340, left: 30, right: 30 } : { top: 90, bottom: 70, left: 420, right: 290 };
    if (radius) {
      const [w, s, e, n] = turf.bbox(turf.circle([cust.lng, cust.lat], radius, { units: "kilometers" }));
      map.fitBounds([[w, s], [e, n]], { padding, duration: 1000 });
      return;
    }
    if (!cand) { map.flyTo({ center: [cust.lng, cust.lat], zoom: Math.max(map.getZoom(), 10), padding, duration: 1000 }); return; }
    const b = new maplibregl.LngLatBounds([cust.lng, cust.lat], [cust.lng, cust.lat]).extend([cand.lon, cand.lat]);
    map.fitBounds(b, { padding, maxZoom: 12.5, duration: 1000 });
  }, [mapRef]);

  // ── 3D scene ─────────────────────────────────────────────────────────
  const push3D = useCallback(() => {
    const sc = sceneRef.current, a = assessRef.current, cust = customerRef.current;
    if (!sc) return;
    sc.setData(cust && a ? { customer: { lng: cust.lng, lat: cust.lat }, candidates: a.candidates, lines: a.nearby_lines || [], radiusKm: a.radius_km } : null);
    sc.setView(viewRef.current);
    sc.setSelected(selectedRef.current);
  }, []);

  // ── customer marker ──────────────────────────────────────────────────
  const placeMarker = useCallback((cust, text) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ element: customerPin(text), draggable: true, anchor: "bottom" })
        .setLngLat([cust.lng, cust.lat]).addTo(map);
      if (!viewRef.current.customer) markerRef.current.getElement().style.visibility = "hidden";
      markerRef.current.on("dragend", () => {
        const { lat, lng } = markerRef.current.getLngLat();
        moveCustomerRef.current(lat, lng);
      });
    } else {
      markerRef.current.setLngLat([cust.lng, cust.lat]);
      markerRef.current.getElement().querySelector(".customer-pin__label").textContent = text;
    }
  }, [mapRef]);

  useEffect(() => {
    const el = markerRef.current?.getElement().querySelector(".customer-pin__label");
    if (el) el.textContent = label || customer?.name || "Customer";
  }, [label, customer]);

  // ── selection ────────────────────────────────────────────────────────
  const select = useCallback((name, { fit = true } = {}) => {
    const cust = customerRef.current, a = assessRef.current;
    const cand = a?.candidates.find(c => c.name === name);
    if (!cust || !cand) return;
    setSelected(name); selectedRef.current = name;
    setFocusedLine(null); focusedRef.current = null;
    // Choosing a substation you'd hidden one-by-one shows it again (a
    // category switched off stays off — the card says so).
    if (viewRef.current.hidden.includes(name)) setViewState(v => ({ ...v, hidden: v.hidden.filter(n => n !== name) }));
    setLine(null);
    drawLine(cust, cand, null);   // the line appears now, not after a request
    drawCandidates();
    drawContext();
    sceneRef.current?.setSelected(name);
    if (fit) frame(cust, cand);
    gridApi.connectLine(cust.lat, cust.lng, name)
      .then(l => {
        if (selectedRef.current !== name || !samePlace(customerRef.current, cust)) return;
        setLine(l);
        if (l.road_geometry) drawLine(cust, cand, l);
      })
      .catch(() => {});
  }, [drawLine, drawCandidates, drawContext, frame]);

  const focusLine = useCallback((l) => {
    setFocusedLine(l); focusedRef.current = l;
    drawContext();
  }, [drawContext]);

  // ── assessment ───────────────────────────────────────────────────────
  const assess = useCallback(async (cust, { keepSelection = false, prefer = preferState, radius = radiusRef.current, fitRadius = false } = {}) => {
    setAssessment(s => ({ status: "loading", data: s.data }));
    try {
      const data = await gridApi.connect(cust.lat, cust.lng, prefer ? undefined : null, { radiusKm: radius });
      if (!samePlace(customerRef.current, cust) || radiusRef.current !== radius) return;
      assessRef.current = data;
      setAssessment({ status: "ready", data });
      if (focusedRef.current && !data.nearby_lines.some(l => lineKey(l) === lineKey(focusedRef.current))) { setFocusedLine(null); focusedRef.current = null; }
      drawContext();
      push3D();
      const keep = keepSelection && data.candidates.some(c => c.name === selectedRef.current) ? selectedRef.current : null;
      const pick = keep || data.recommended || data.candidates[0]?.name;
      if (pick) select(pick, { fit: !keep && !fitRadius });
      else { drawCandidates(); drawLine(null); frame(cust, null); }
      if (fitRadius) frame(cust, null, { radius });
    } catch (err) {
      if (!samePlace(customerRef.current, cust)) return;
      setAssessment({ status: "error", message: err.message });
    }
  }, [preferState, select, drawCandidates, drawContext, drawLine, frame, push3D]);

  const setCustomer = useCallback((place, { name } = {}) => {
    const cust = {
      name: place.name, address: place.address || "", state: place.state || null, lga: place.lga || null,
      lat: place.lat, lng: place.lng, confidence: place.confidence || null, confidence_reason: place.confidence_reason || null,
      precision: place.precision || null, source: place.source || place.kind || null, type_label: place.type_label || null,
      confirmed: place.source === "manual" || place.source === "onction" || place.source === "coordinates",
    };
    setOpen(true); setDropping(false);
    customerRef.current = cust; setCustomerState(cust);
    setLabel(name ?? place.name ?? "");
    setSelected(null); selectedRef.current = null; setLine(null);
    setFocusedLine(null); focusedRef.current = null;
    if (viewRef.current.hidden.length) setViewState(v => ({ ...v, hidden: [] })); // per-analysis hides don't carry over
    placeMarker(cust, name ?? place.name ?? "Customer");
    frame(cust, null);
    assess(cust);
  }, [assess, placeMarker, frame]);

  // "Yes, that's the site": the user vouches for the point.
  const confirmLocation = useCallback(() => {
    const cust = customerRef.current;
    if (!cust) return;
    const upd = { ...cust, confirmed: true };
    customerRef.current = upd; setCustomerState(upd);
  }, []);

  // Dragged pin: the user knows better than the geocoder — re-locate and
  // re-assess, keeping the chosen substation if it's still a candidate.
  const moveCustomer = useCallback(async (lat, lng) => {
    const prev = customerRef.current;
    const cust = { ...prev, lat, lng, confidence: "high", confidence_reason: "Placed by you on the map", precision: "site", source: "manual", confirmed: true };
    customerRef.current = cust; setCustomerState(cust);
    assess(cust, { keepSelection: true });
    try {
      const r = await gridApi.geocodeReverse(lat, lng);
      if (!samePlace(customerRef.current, cust)) return;
      const upd = { ...customerRef.current, address: r.address || cust.address, state: r.state, lga: r.lga };
      customerRef.current = upd; setCustomerState(upd);
    } catch (err) {
      if (samePlace(customerRef.current, cust)) setAssessment({ status: "error", message: err.message });
    }
  }, [assess]);
  const moveCustomerRef = useRef(moveCustomer);
  moveCustomerRef.current = moveCustomer;

  // Prefer-state toggle re-runs the assessment.
  const togglePreferState = useCallback(() => {
    const next = !preferState;
    setPreferState(next);
    if (customerRef.current) assess(customerRef.current, { keepSelection: false, prefer: next });
  }, [preferState, assess]);

  const changeRadius = useCallback((km, { fit = true } = {}) => {
    setRadiusKm(km); radiusRef.current = km;
    if (customerRef.current) assess(customerRef.current, { keepSelection: true, radius: km, fitRadius: fit });
  }, [assess]);

  const showRegion = useCallback(() => {
    const cust = customerRef.current;
    if (cust) frame(cust, null, { radius: assessRef.current?.radius_km ?? radiusRef.current });
  }, [frame]);

  // ── 3D on/off ────────────────────────────────────────────────────────
  const hasCustomer = !!customer;
  const toggle3D = useCallback(() => {
    setThreeD(v => {
      try { localStorage.setItem(THREE_D_KEY, v ? "0" : "1"); } catch { /* storage blocked */ }
      return !v;
    });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const active = threeD && open && hasCustomer;
    if (!active) {
      map.getContainer().classList.remove("connect-3d-on");
      if (sceneRef.current) { sceneRef.current.setEnabled(false); setThreeDStatus("off"); if (map.getPitch() > 5) map.easeTo({ pitch: 0, duration: 700 }); }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!sceneRef.current) {
          setThreeDStatus("loading");
          const { createConnect3D } = await import("./connect3d.js");
          if (cancelled) return;
          sceneRef.current = createConnect3D(map, {
            onHover: (hit, point) => showTip(hit, point),
            onClick: (hit) => {
              if (hit.kind === "substation") select(hit.candidate.name, { fit: false });
              else if (hit.kind === "line") focusLine(hit.line);
            },
          });
          sceneRef.current.bind();
          if (import.meta.env.DEV || new URLSearchParams(window.location.search).has("e2e")) window.__connect3d = sceneRef.current;
        }
        push3D();
        await sceneRef.current.setEnabled(true);
        if (cancelled) return;
        setThreeDStatus("on");
        map.getContainer().classList.add("connect-3d-on");
        // Tilt once any fly-to-the-customer has finished — starting a second
        // camera move now would cancel it.
        const tilt = () => { if (!cancelled && map.getPitch() < 30) map.easeTo({ pitch: 55, bearing: map.getBearing() || -12, duration: 900 }); };
        if (map.isMoving()) map.once("moveend", tilt); else tilt();
      } catch (err) {
        console.error("3D view failed:", err);
        if (!cancelled) setThreeDStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [threeD, open, hasCustomer, mapReady, mapRef, push3D, select, focusLine, showTip]);

  // ── drop-a-pin mode (same capture approach as the scanner) ────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!dropping || !map) return;
    const canvas = map.getCanvas();
    map.getContainer().classList.add("scan-armed");
    let down = null;
    const onDown = (e) => { if (e.target === canvas) down = { x: e.clientX, y: e.clientY }; };
    const onClick = async (e) => {
      if (e.target !== canvas) return;
      e.stopPropagation(); e.preventDefault();
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_TOLERANCE_PX) return;
      const rect = canvas.getBoundingClientRect();
      const { lng, lat } = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
      setDropping(false);
      const base = { name: "Dropped pin", lat, lng, confidence: "high", confidence_reason: "Placed by you on the map", precision: "site", source: "manual" };
      setCustomer(base, { name: "" });
      try {
        const r = await gridApi.geocodeReverse(lat, lng);
        if (customerRef.current?.lat !== lat) return;
        const upd = { ...customerRef.current, name: r.name || "Dropped pin", address: r.address, state: r.state, lga: r.lga };
        customerRef.current = upd; setCustomerState(upd);
      } catch (err) {
        setAssessment({ status: "error", message: err.message });
      }
    };
    const onKey = (e) => { if (e.key === "Escape") setDropping(false); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      map.getContainer().classList.remove("scan-armed");
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [dropping, mapRef, setCustomer]);

  // 2D interaction: hover and click on candidates and nearby lines. (When
  // a 3D model is under the pointer, the 3D layer's own hover wins.)
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const candHit = (f) => assessRef.current?.candidates.find(c => c.name === f.properties.name);
    const lineHit = (f) => assessRef.current?.nearby_lines?.find(l => lineKey(l) === f.properties.key);
    const over3D = (e) => !!sceneRef.current?.pick(e.point);
    const onCandClick = (e) => { const f = e.features?.[0]; if (f && !over3D(e)) select(f.properties.name, { fit: false }); };
    const onLineClick = (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: ["connect-cands"] }).length || over3D(e)) return;
      const l = e.features?.[0] && lineHit(e.features[0]);
      if (l) focusLine(l);
    };
    const onCandMove = (e) => {
      if (over3D(e)) return;
      map.getCanvas().style.cursor = "pointer";
      const c = e.features?.[0] && candHit(e.features[0]);
      if (c) showTip({ kind: "substation", candidate: c }, e.point);
    };
    const onLineMove = (e) => {
      if (over3D(e) || map.queryRenderedFeatures(e.point, { layers: ["connect-cands"] }).length) return;
      map.getCanvas().style.cursor = "pointer";
      const l = e.features?.[0] && lineHit(e.features[0]);
      if (l) showTip({ kind: "line", line: l }, e.point);
    };
    const leave = () => { map.getCanvas().style.cursor = ""; showTip(null); };
    // Layers may not exist yet; MapLibre accepts handlers for a layer id
    // either way and they fire once the layer is added.
    map.on("click", "connect-cands", onCandClick);
    map.on("click", "connect-lines-hit", onLineClick);
    map.on("mousemove", "connect-cands", onCandMove);
    map.on("mousemove", "connect-lines-hit", onLineMove);
    map.on("mouseleave", "connect-cands", leave);
    map.on("mouseleave", "connect-lines-hit", leave);
    return () => {
      map.off("click", "connect-cands", onCandClick); map.off("click", "connect-lines-hit", onLineClick);
      map.off("mousemove", "connect-cands", onCandMove); map.off("mousemove", "connect-lines-hit", onLineMove);
      map.off("mouseleave", "connect-cands", leave); map.off("mouseleave", "connect-lines-hit", leave);
    };
  }, [mapReady, mapRef, select, focusLine, showTip]);

  // Energy flowing along the chosen connection, toward the customer. Off →
  // a plain dashed line; paused → frozen where it is; reset → from the start.
  const flowStep = useRef(0);
  useEffect(() => { flowStep.current = 0; }, [flowResets]);
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !selected) return;
    if (!view.flow || !view.connection) {
      if (map.getLayer("connect-line")) map.setPaintProperty("connect-line", "line-dasharray", [2, 1.2]);
      return;
    }
    if (map.getLayer("connect-line")) map.setPaintProperty("connect-line", "line-dasharray", DASH_STEPS[flowStep.current]);
    if (view.flowPaused || reducedMotion()) return;
    const id = setInterval(() => {
      if (document.hidden || !map.getLayer("connect-line")) return;
      flowStep.current = (flowStep.current + 1) % DASH_STEPS.length;
      map.setPaintProperty("connect-line", "line-dasharray", DASH_STEPS[flowStep.current]);
    }, 70);
    return () => clearInterval(id);
  }, [mapReady, mapRef, selected, view.flow, view.connection, view.flowPaused, flowResets]);

  // Any view change: re-filter 2D + 3D, show/hide the customer pin. No
  // camera move, no new layers, no reload of the 3D scene.
  useEffect(() => {
    saveView(view);
    const map = mapRef.current;
    if (!mapReady || !map) return;
    applyView2D(map, view, !!selectedRef.current);
    const el = markerRef.current?.getElement();
    if (el) el.style.visibility = view.customer ? "" : "hidden";
    sceneRef.current?.setView(view);
    if (!view.customer || !view.substations) showTip(null);
  }, [view, mapReady, mapRef, showTip]);

  // Theme switch wipes the style: redraw from current state.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const redraw = () => {
      if (!customerRef.current || map.getSource("connect-cands-src")) return;
      drawCandidates();
      drawContext();
      const cand = assessRef.current?.candidates.find(c => c.name === selectedRef.current);
      if (cand) drawLine(customerRef.current, cand, null);
      sceneRef.current?.restore();
    };
    map.on("styledata", redraw);
    return () => map.off("styledata", redraw);
  }, [mapReady, mapRef, drawCandidates, drawContext, drawLine]);

  const close = useCallback(() => {
    setOpen(false); setDropping(false);
    customerRef.current = null; setCustomerState(null);
    setAssessment({ status: "idle" }); setSelected(null); selectedRef.current = null; setLine(null);
    setFocusedLine(null); focusedRef.current = null;
    markerRef.current?.remove(); markerRef.current = null;
    showTip(null);
    sceneRef.current?.setData(null);
    const map = mapRef.current;
    ["connect-cands-src", "connect-line-src", "connect-radius-src", "connect-lines-src"].forEach(id => map?.getSource(id)?.setData(EMPTY));
  }, [mapRef, showTip]);

  const startDrop = useCallback(() => { setOpen(true); setDropping(true); }, []);

  // ── view controls ────────────────────────────────────────────────────
  const toggleLayer = useCallback((k) => setViewState(v => ({ ...v, [k]: !v[k] })), []);
  const allLayers = useCallback((on) => setViewState(v => ({ ...v, ...Object.fromEntries(VIEW_CATEGORIES.map(k => [k, on])) })), []);
  const resetView = useCallback(() => { setViewState({ ...VIEW_DEFAULTS }); setFlowResets(n => n + 1); sceneRef.current?.resetFlow(); }, []);
  const toggleFocus = useCallback(() => setViewState(v => ({ ...v, focus: !v.focus })), []);
  const toggleFlowPause = useCallback(() => setViewState(v => ({ ...v, flowPaused: !v.flowPaused })), []);
  const resetFlow = useCallback(() => { setFlowResets(n => n + 1); sceneRef.current?.resetFlow(); }, []);
  const toggleHidden = useCallback((name) => setViewState(v => ({ ...v, hidden: v.hidden.includes(name) ? v.hidden.filter(n => n !== name) : [...v.hidden, name] })), []);
  const showAllHidden = useCallback(() => setViewState(v => ({ ...v, hidden: [] })), []);
  // Clear the evaluated connection (the assessment stays).
  const clearSelection = useCallback(() => {
    setSelected(null); selectedRef.current = null; setLine(null);
    drawLine(null); drawCandidates(); drawContext();
    sceneRef.current?.setSelected(null);
  }, [drawLine, drawCandidates, drawContext]);

  return {
    open, customer, label, setLabel, preferState, togglePreferState, assessment, selected, line, dropping,
    radiusKm, changeRadius, showRegion, focusedLine, focusLine, confirmLocation,
    threeD, threeDStatus, toggle3D,
    view, toggleLayer, allLayers, resetView, toggleFocus, toggleFlowPause, resetFlow, toggleHidden, showAllHidden, clearSelection,
    setCustomer, select, startDrop, cancelDrop: () => setDropping(false), close,
  };
}
