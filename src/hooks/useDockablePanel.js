import { useState, useEffect, useRef, useCallback } from "react";

// State + drag logic for a panel that can float over the map, dock into the
// sidebar, or be closed. One drag gesture carries across both: grab the
// floating card's header and drop it over the sidebar to dock it; grab the
// docked header and pull it past the sidebar's edge and it pops out as a
// floating card under the cursor, still following the same drag. Move/up
// listeners live on window (not pointer capture on the header) because the
// header element itself unmounts and remounts when the panel changes mode.
//
// Floating `pos` is {x, y} of the card's top-left, relative to the map area;
// null means "default corner" (CSS bottom-left). Mode + pos persist per
// viewer in localStorage — a convenience only, so every access is guarded.

const DRAG_THRESHOLD = 5; // px before a docked-header press counts as a drag
const EDGE = 8;           // min gap kept between a dropped card and the map edge

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export default function useDockablePanel({ storageKey, mapAreaRef, cardRef, sidebarOpen, openSidebar }) {
  const saved = load(storageKey);
  const [mode, setMode] = useState(saved?.mode === "docked" || saved?.mode === "closed" ? saved.mode : "floating");
  const [pos,  setPos]  = useState(saved?.pos ?? null);
  const [dragging, setDragging] = useState(false);
  const [overSidebar, setOverSidebar] = useState(false);

  useEffect(() => { save(storageKey, { mode, pos }); }, [storageKey, mode, pos]);

  // Can't stay docked in a sidebar that isn't there — below `sm` the sidebar
  // is an overlay that starts closed, so float instead of vanishing.
  useEffect(() => {
    if (mode === "docked" && !sidebarOpen) setMode("floating");
  }, [mode, sidebarOpen]);

  const clamp = useCallback((p) => {
    const area = mapAreaRef.current, card = cardRef.current;
    if (!area || !p) return p;
    const w = card?.offsetWidth ?? 220, h = card?.offsetHeight ?? 180;
    return {
      x: Math.max(EDGE, Math.min(p.x, area.clientWidth  - w - EDGE)),
      y: Math.max(EDGE, Math.min(p.y, area.clientHeight - h - EDGE)),
    };
  }, [mapAreaRef, cardRef]);

  // Keep a stored position on-screen after the window (or map area) shrinks.
  useEffect(() => {
    const onResize = () => setPos(p => clamp(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const drag = useRef(null);

  const startDrag = useCallback((e) => {
    if (e.button !== 0 || e.target.closest("button")) return; // header buttons stay clickable
    const area = mapAreaRef.current;
    if (!area) return;
    e.preventDefault();
    const header = e.currentTarget.getBoundingClientRect();
    drag.current = {
      startX: e.clientX, startY: e.clientY,
      // where inside the header the pointer grabbed, so the card doesn't jump
      grabX: Math.min(e.clientX - header.left, 200), grabY: e.clientY - header.top,
      mode, active: false, over: false,
    };

    const onMove = (ev) => {
      const d = drag.current;
      if (!d) return;
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.active = true;
        setDragging(true);
      }
      const rect = area.getBoundingClientRect();
      const over = sidebarOpen && ev.clientX < rect.left;
      if (over !== d.over) { d.over = over; setOverSidebar(over); }
      // A docked panel pops out once the pointer leaves the sidebar; from then
      // on it's a floating card following the pointer, like any other drag.
      if (d.mode === "docked" && !over) { d.mode = "floating"; setMode("floating"); }
      if (d.mode === "floating") {
        // Unclamped while dragging, so the card can travel onto the sidebar.
        setPos({ x: ev.clientX - rect.left - d.grabX, y: ev.clientY - rect.top - d.grabY });
      }
    };

    const onUp = () => {
      const d = drag.current;
      drag.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!d?.active) return;
      setDragging(false);
      setOverSidebar(false);
      if (d.over) setMode("docked");
      else setPos(p => clamp(p));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [mode, sidebarOpen, mapAreaRef, clamp]);

  const dock = useCallback(() => { openSidebar(); setMode("docked"); }, [openSidebar]);
  const float = useCallback(() => setMode("floating"), []);
  const close = useCallback(() => setMode("closed"), []);

  return { mode, pos, dragging, overSidebar, startDrag, dock, float, close };
}
