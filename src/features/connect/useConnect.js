import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { gridApi } from "@/lib/gridApi";
import { whenStyleReady } from "@/features/explore/whenStyleReady";

// The Connect workflow — "a customer is here; what infrastructure could serve
// them?": locate the customer (search result, dropped pin, or dragged pin),
// ask /api/connect for nearby infrastructure + a planning indication, and
// draw customer → substation the moment one is chosen. Owns "connect-"
// layers and the customer marker; touches nothing else on the map.

export const STATUS_COLOR = { existing: "#38bdf8", ongoing: "#a78bfa", proposed: "#a78bfa" };
const LINE = "#f5a623";
const EMPTY = { type: "FeatureCollection", features: [] };
const DRAG_TOLERANCE_PX = 5;

function ensureLayers(map) {
  if (map.getSource("connect-cands-src")) return;
  map.addSource("connect-cands-src", { type: "geojson", data: EMPTY });
  map.addSource("connect-line-src", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "connect-road", type: "line", source: "connect-line-src", filter: ["==", ["get", "kind"], "road"],
    layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.55 } });
  map.addLayer({ id: "connect-line-glow", type: "line", source: "connect-line-src", filter: ["==", ["get", "kind"], "straight"],
    layout: { "line-cap": "round" }, paint: { "line-color": LINE, "line-width": 9, "line-opacity": 0.22, "line-blur": 3 } });
  map.addLayer({ id: "connect-line", type: "line", source: "connect-line-src", filter: ["==", ["get", "kind"], "straight"],
    layout: { "line-cap": "round" }, paint: { "line-color": LINE, "line-width": 3, "line-dasharray": [2, 1.2] } });
  map.addLayer({ id: "connect-line-label", type: "symbol", source: "connect-line-src", filter: ["==", ["get", "kind"], "straight"],
    layout: { "symbol-placement": "line-center", "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12,
      "text-offset": [0, -0.9], "text-keep-upright": true, "text-allow-overlap": true },
    paint: { "text-color": LINE, "text-halo-color": "rgba(0,0,0,0.85)", "text-halo-width": 2 } });
  map.addLayer({ id: "connect-cands", type: "circle", source: "connect-cands-src",
    paint: {
      "circle-radius": ["case", ["get", "selected"], 9, 6.5],
      "circle-color": ["case", ["get", "supply_point"], ["get", "color"], "rgba(0,0,0,0.35)"],
      "circle-stroke-color": ["case", ["get", "selected"], LINE, ["get", "color"]],
      "circle-stroke-width": ["case", ["get", "selected"], 3.5, 2],
      "circle-opacity": ["case", ["==", ["get", "status"], "existing"], 1, 0.65],
    } });
  map.addLayer({ id: "connect-cand-labels", type: "symbol", source: "connect-cands-src",
    layout: { "text-field": ["concat", ["to-string", ["get", "rank"]], " · ", ["get", "name"]], "text-font": ["Noto Sans Bold"],
      "text-size": ["case", ["get", "selected"], 12, 10.5], "text-offset": [0, 1.25], "text-anchor": "top", "text-optional": true },
    paint: { "text-color": ["case", ["get", "selected"], LINE, "#e2e8f0"], "text-halo-color": "rgba(0,0,0,0.8)", "text-halo-width": 1.6 } });
}

function customerPin(label) {
  const el = document.createElement("div");
  el.className = "customer-pin";
  el.innerHTML = `<div class="customer-pin__label"></div><div class="customer-pin__head"></div>`;
  el.querySelector(".customer-pin__label").textContent = label;
  el.title = "Drag to the exact site";
  return el;
}

export default function useConnect({ mapRef, mapReady }) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomerState] = useState(null);  // { name, address, state, lga, lat, lng, confidence, confidence_reason, precision, source }
  const [label, setLabel] = useState("");
  const [preferState, setPreferState] = useState(true);   // prefer infrastructure in the customer's state
  const [assessment, setAssessment] = useState({ status: "idle" });
  const [selected, setSelected] = useState(null);
  const [line, setLine] = useState(null);                 // /api/connect/line result for `selected`
  const [dropping, setDropping] = useState(false);

  const markerRef = useRef(null);
  const customerRef = useRef(null);
  const assessRef = useRef(null);
  const selectedRef = useRef(null);
  customerRef.current = customer; assessRef.current = assessment.data; selectedRef.current = selected;

  // ── drawing ──────────────────────────────────────────────────────────
  const drawCandidates = useCallback(() => {
    const map = mapRef.current, a = assessRef.current;
    if (!map) return;
    whenStyleReady(map, "connect-cands", () => {
      ensureLayers(map);
      const feats = (a?.candidates || []).map((c, i) => ({
        type: "Feature",
        properties: { name: c.name, rank: i + 1, status: c.status, supply_point: c.supply_point, selected: c.name === selectedRef.current, color: STATUS_COLOR[c.status] || "#94a3b8" },
        geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      }));
      map.getSource("connect-cands-src").setData({ type: "FeatureCollection", features: feats });
    });
  }, [mapRef]);

  const drawLine = useCallback((cust, cand, road) => {
    const map = mapRef.current;
    if (!map) return;
    whenStyleReady(map, "connect-line", () => {
      ensureLayers(map);
      const feats = [];
      if (cust && cand) {
        feats.push({ type: "Feature", properties: { kind: "straight", label: `${cand.distance_km} km` },
          geometry: { type: "LineString", coordinates: [[cust.lng, cust.lat], [cand.lon, cand.lat]] } });
        if (road?.road_geometry) feats.push({ type: "Feature", properties: { kind: "road" }, geometry: { type: "LineString", coordinates: road.road_geometry } });
      }
      map.getSource("connect-line-src").setData({ type: "FeatureCollection", features: feats });
    });
  }, [mapRef]);

  const frame = useCallback((cust, cand) => {
    const map = mapRef.current;
    if (!map || !cust) return;
    const narrow = window.matchMedia("(max-width: 639px)").matches;
    const padding = narrow ? { top: 90, bottom: 340, left: 30, right: 30 } : { top: 90, bottom: 70, left: 420, right: 290 };
    if (!cand) { map.flyTo({ center: [cust.lng, cust.lat], zoom: Math.max(map.getZoom(), 10), padding, duration: 1000 }); return; }
    const b = new maplibregl.LngLatBounds([cust.lng, cust.lat], [cust.lng, cust.lat]).extend([cand.lon, cand.lat]);
    map.fitBounds(b, { padding, maxZoom: 12.5, duration: 1000 });
  }, [mapRef]);

  // ── customer marker ──────────────────────────────────────────────────
  const placeMarker = useCallback((cust, text) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ element: customerPin(text), draggable: true, anchor: "bottom" })
        .setLngLat([cust.lng, cust.lat]).addTo(map);
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
    setLine(null);
    drawLine(cust, cand, null);   // the line appears now, not after a request
    drawCandidates();
    if (fit) frame(cust, cand);
    gridApi.connectLine(cust.lat, cust.lng, name)
      .then(l => {
        if (selectedRef.current !== name || customerRef.current !== cust) return;
        setLine(l);
        if (l.road_geometry) drawLine(cust, cand, l);
      })
      .catch(() => {});
  }, [drawLine, drawCandidates, frame]);

  // ── assessment ───────────────────────────────────────────────────────
  const assess = useCallback(async (cust, { keepSelection = false, prefer = preferState } = {}) => {
    setAssessment(s => ({ status: "loading", data: s.data }));
    try {
      const data = await gridApi.connect(cust.lat, cust.lng, prefer ? undefined : null);
      if (customerRef.current !== cust) return;
      assessRef.current = data;
      setAssessment({ status: "ready", data });
      const keep = keepSelection && data.candidates.some(c => c.name === selectedRef.current) ? selectedRef.current : null;
      const pick = keep || data.recommended || data.candidates[0]?.name;
      if (pick) select(pick, { fit: !keep });
      else { drawCandidates(); drawLine(null); frame(cust, null); }
    } catch (err) {
      if (customerRef.current !== cust) return;
      setAssessment({ status: "error", message: err.message });
    }
  }, [preferState, select, drawCandidates, drawLine, frame]);

  const setCustomer = useCallback((place, { name } = {}) => {
    const cust = {
      name: place.name, address: place.address || "", state: place.state || null, lga: place.lga || null,
      lat: place.lat, lng: place.lng, confidence: place.confidence || null, confidence_reason: place.confidence_reason || null,
      precision: place.precision || null, source: place.source || place.kind || null,
    };
    setOpen(true); setDropping(false);
    customerRef.current = cust; setCustomerState(cust);
    setLabel(name ?? place.name ?? "");
    setSelected(null); selectedRef.current = null; setLine(null);
    placeMarker(cust, name ?? place.name ?? "Customer");
    frame(cust, null);
    assess(cust);
  }, [assess, placeMarker, frame]);

  // Dragged pin: the user knows better than the geocoder — re-locate and
  // re-assess, keeping the chosen substation if it's still a candidate.
  const moveCustomer = useCallback(async (lat, lng) => {
    const prev = customerRef.current;
    const cust = { ...prev, lat, lng, confidence: "high", confidence_reason: "Placed by you on the map", precision: "site", source: "manual" };
    customerRef.current = cust; setCustomerState(cust);
    assess(cust, { keepSelection: true });
    try {
      const r = await gridApi.geocodeReverse(lat, lng);
      if (customerRef.current !== cust) return;
      const upd = { ...cust, address: r.address || cust.address, state: r.state, lga: r.lga };
      customerRef.current = upd; setCustomerState(upd);
    } catch (err) {
      if (customerRef.current === cust) setAssessment({ status: "error", message: err.message });
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

  // Click a candidate on the map to select it.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const onClick = (e) => { const f = e.features?.[0]; if (f) select(f.properties.name, { fit: false }); };
    const enter = () => { map.getCanvas().style.cursor = "pointer"; };
    const leave = () => { map.getCanvas().style.cursor = ""; };
    // Layers may not exist yet; MapLibre accepts handlers for a layer id
    // either way and they fire once the layer is added.
    map.on("click", "connect-cands", onClick);
    map.on("mouseenter", "connect-cands", enter);
    map.on("mouseleave", "connect-cands", leave);
    return () => { map.off("click", "connect-cands", onClick); map.off("mouseenter", "connect-cands", enter); map.off("mouseleave", "connect-cands", leave); };
  }, [mapReady, mapRef, select]);

  // Theme switch wipes the style: redraw from current state.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const redraw = () => {
      if (!customerRef.current || map.getSource("connect-cands-src")) return;
      drawCandidates();
      const cand = assessRef.current?.candidates.find(c => c.name === selectedRef.current);
      if (cand) drawLine(customerRef.current, cand, null);
    };
    map.on("styledata", redraw);
    return () => map.off("styledata", redraw);
  }, [mapReady, mapRef, drawCandidates, drawLine]);

  const close = useCallback(() => {
    setOpen(false); setDropping(false);
    customerRef.current = null; setCustomerState(null);
    setAssessment({ status: "idle" }); setSelected(null); selectedRef.current = null; setLine(null);
    markerRef.current?.remove(); markerRef.current = null;
    const map = mapRef.current;
    map?.getSource("connect-cands-src")?.setData(EMPTY);
    map?.getSource("connect-line-src")?.setData(EMPTY);
  }, [mapRef]);

  const startDrop = useCallback(() => { setOpen(true); setDropping(true); }, []);

  return {
    open, customer, label, setLabel, preferState, togglePreferState, assessment, selected, line, dropping,
    setCustomer, select, startDrop, cancelDrop: () => setDropping(false), close,
  };
}
