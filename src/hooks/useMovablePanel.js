import { useState, useEffect, useRef, useCallback } from "react";

// A map panel the user can move by its grip handle: the TCN legend, the map
// layers panel, the customer search. Only the grip starts a drag, so inputs,
// buttons and result lists inside the panel behave normally, and the grip
// sets `touch-action: none` so on phones a drag on it never scrolls the page
// or pans the map. Arrow keys on the focused grip move it too.
//
// `pos` is the panel's top-left relative to its positioned parent (the map
// area); null = the panel's own CSS placement. Kept for this browser session
// only (sessionStorage), guarded since storage can be unavailable. The panel
// is always kept fully inside the map area, including after a resize.

const THRESHOLD = 4; // px before a press on the grip counts as a drag
const EDGE = 8;      // min gap kept between the panel and the map area's edge
const KEY_STEP = 16;
const MIN_VISIBLE = 140; // px of a tall panel that always stays inside the map

// The panel moved most recently sits above the others (and above the Add
// Location card), so a panel dropped onto another is never trapped under it.
const BASE_Z = 29; // above the Add Location card (25) and the Explore cards (26–28)
let topZ = BASE_Z;

const load = (key) => { try { return JSON.parse(sessionStorage.getItem(key)) || null; } catch { return null; } };
const save = (key, v) => { try { v ? sessionStorage.setItem(key, JSON.stringify(v)) : sessionStorage.removeItem(key); } catch { /* storage unavailable */ } };

export default function useMovablePanel(id) {
  const key = `gis:panel:${id}`;
  const ref = useRef(null);
  const [pos, setPos] = useState(() => load(key));
  const [dragging, setDragging] = useState(false);
  const [z, setZ] = useState(null);

  useEffect(() => { save(key, pos); }, [key, pos]);

  const area = () => ref.current?.offsetParent;
  const clamp = useCallback((p) => {
    const el = ref.current, a = el?.offsetParent;
    if (!p || !el || !a) return p;
    // Tall panels (the legend) may go lower than their full height allows:
    // the style below caps their height to the space left, so at least
    // MIN_VISIBLE px (the header and a bit) always stays on screen.
    const maxX = Math.max(EDGE, a.clientWidth - el.offsetWidth - EDGE);
    const maxY = Math.max(EDGE, a.clientHeight - Math.min(el.offsetHeight, MIN_VISIBLE) - EDGE);
    const x = Math.round(Math.max(EDGE, Math.min(p.x, maxX))), y = Math.round(Math.max(EDGE, Math.min(p.y, maxY)));
    return x === p.x && y === p.y ? p : { x, y };
  }, []);

  // Stay on-screen when the window, the map area or the panel's size changes.
  useEffect(() => {
    const el = ref.current, a = area();
    if (!el || !a || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setPos(p => clamp(p)));
    ro.observe(a); ro.observe(el);
    return () => ro.disconnect();
  }, [clamp]);

  // Current top-left relative to the map area, wherever CSS put the panel.
  const here = () => {
    const r = ref.current.getBoundingClientRect(), ar = area().getBoundingClientRect();
    return { x: r.left - ar.left, y: r.top - ar.top };
  };

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 || !ref.current || !area()) return;
    e.preventDefault();
    e.stopPropagation();
    setZ(++topZ);
    const start = { x: e.clientX, y: e.clientY, from: here() };
    let active = false;
    const move = (ev) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (!active) {
        if (Math.hypot(dx, dy) < THRESHOLD) return;
        active = true;
        setDragging(true);
      }
      setPos(clamp({ x: start.from.x + dx, y: start.from.y + dy }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (active) setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [clamp]);

  const onKeyDown = useCallback((e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || !ref.current || !area()) return;
    e.preventDefault();
    setZ(++topZ);
    const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    setPos(p => clamp({ x: (p || here()).x + d[0] * step, y: (p || here()).y + d[1] * step }));
  }, [clamp]);

  const reset = useCallback(() => { setPos(null); setZ(null); }, []);

  // Inline placement overrides the panel's own (responsive) CSS position. A
  // moved panel is capped to the space below it so it never runs off-screen.
  const style = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto", maxHeight: `calc(100% - ${pos.y + EDGE}px)`, zIndex: z ?? BASE_Z }
    : undefined;

  const gripProps = {
    onPointerDown, onKeyDown, role: "button", tabIndex: 0,
    "aria-label": "Move panel (drag, or use the arrow keys)",
    title: "Drag to move",
    style: { touchAction: "none" },
  };

  return { ref, pos, moved: !!pos, dragging, style, gripProps, reset };
}
