import { useState, useEffect, useRef, useCallback } from "react";

// The Grid Route's 3D layer (route3d.js): lazy-loaded the first time it's
// needed, fed the route's grid path, tilted into view, and removed cleanly
// when the route closes or 3D is switched off. Shares the 3D on/off choice
// with the Connect view (same storage key), so the app has one 3D setting.

const THREE_D_KEY = "gis:connect-3d";
const VIEW_DEFAULTS = { towers: true, substations: true, flow: true };

const initial3D = () => {
  try { const v = localStorage.getItem(THREE_D_KEY); if (v != null) return v === "1"; } catch { /* storage blocked */ }
  return !window.matchMedia("(max-width: 639px)").matches; // phones start flat
};

export default function useRoute3D({ mapRef, mapReady, open, result, getSubstations }) {
  const [threeD, setThreeD] = useState(initial3D);
  const [status, setStatus] = useState("off"); // off | loading | on | error
  const [view, setViewState] = useState(VIEW_DEFAULTS);
  const sceneRef = useRef(null);

  // The grid path as the 3D layer wants it: the route's substations in order.
  const nodes = useCallback((r) => {
    if (!r?.hops?.length) return [];
    const names = [r.hops[0].from_node, ...r.hops.map(h => h.to_node)];
    const subs = getSubstations();
    return names.map(n => subs.find(s => s.name === n)).filter(Boolean).map(s => ({ name: s.name, lng: s.lon, lat: s.lat }));
  }, [getSubstations]);

  const active = threeD && open && !!result;

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (!active) {
      if (sceneRef.current) {
        sceneRef.current.setData(null);
        sceneRef.current.setEnabled(false);
        setStatus("off");
        if (map.getPitch() > 5 && !open) map.easeTo({ pitch: 0, duration: 700 });
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!sceneRef.current) {
          setStatus("loading");
          const { createRoute3D } = await import("./route3d.js");
          if (cancelled) return;
          sceneRef.current = createRoute3D(map);
          if (import.meta.env.DEV || new URLSearchParams(window.location.search).has("e2e")) window.__route3d = sceneRef.current;
        }
        sceneRef.current.setView(view);
        sceneRef.current.setData({ nodes: nodes(result) });
        await sceneRef.current.setEnabled(true);
        if (cancelled) return;
        setStatus("on");
        const tilt = () => { if (!cancelled && map.getPitch() < 30) map.easeTo({ pitch: 50, bearing: map.getBearing() || -10, duration: 900 }); };
        if (map.isMoving()) map.once("moveend", tilt); else tilt();
      } catch (err) {
        console.error("Route 3D view failed:", err);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [active, open, result, mapReady, mapRef, nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flatten when 3D is switched off while the route stays open.
  useEffect(() => {
    const map = mapRef.current;
    if (map && open && !threeD && map.getPitch() > 5) map.easeTo({ pitch: 0, duration: 700 });
  }, [threeD, open, mapRef]);

  useEffect(() => { sceneRef.current?.setView(view); }, [view]);

  // Theme switch wipes the style, custom layer included — put it back.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const restore = () => sceneRef.current?.restore();
    map.on("styledata", restore);
    return () => map.off("styledata", restore);
  }, [mapReady, mapRef]);

  useEffect(() => () => { sceneRef.current?.destroy(); sceneRef.current = null; }, []);

  const toggle3D = useCallback(() => {
    setThreeD(v => {
      try { localStorage.setItem(THREE_D_KEY, v ? "0" : "1"); } catch { /* storage blocked */ }
      return !v;
    });
  }, []);
  const toggleLayer = useCallback((k) => setViewState(v => ({ ...v, [k]: !v[k] })), []);
  const allLayers = useCallback((on) => setViewState({ towers: on, substations: on, flow: on }), []);

  return { threeD, status, toggle3D, view, toggleLayer, allLayers };
}
