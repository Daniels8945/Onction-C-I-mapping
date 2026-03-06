// components/StatusBar.jsx
const Dot = ({ color }) => (
  <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: color }} />
);

export default function StatusBar({ coords, zoom, mode }) {
  return (
    <footer className="h-[26px] bg-panel border-t border-rim flex items-center
      px-4 gap-5 text-[9px] tracking-[0.06em] text-slate flex-shrink-0 overflow-hidden">
      <span className="flex items-center gap-1.5">
        <Dot color="#00e5a0" />
        MapLibre GL JS v4 — WebGL Vector Tiles
      </span>
      <span className="flex items-center gap-1.5">
        <Dot color="#f5a623" />
        Turf.js v6 — Spatial Analysis Active
      </span>
      <span>{coords || "Move over map for coordinates"}</span>
      <span className="ml-auto">Zoom: {zoom.toFixed(1)}</span>
      <span>Mode: {mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
    </footer>
  );
}
