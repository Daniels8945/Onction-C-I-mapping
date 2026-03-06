// components/Topbar.jsx
import ToolButton from "./ui/ToolButton";

const KPI = ({ value, label }) => (
  <div className="text-right flex-shrink-0">
    <div className="text-[15px] font-bold text-accent leading-none">{value}</div>
    <div className="text-[8px] text-slate tracking-[0.12em] uppercase mt-0.5">{label}</div>
  </div>
);

function ThemeToggle({ isDark, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="h-[30px] w-[30px] flex items-center justify-center rounded-[5px]
        border border-rim text-slate hover:border-accent hover:text-accent
        transition-all duration-150 cursor-pointer flex-shrink-0 text-[14px]"
    >
      {isDark ? "☀" : "☾"}
    </button>
  );
}

export default function Topbar({
  mode, onModeChange,
  onNearestGenco, onClear, onExport,
  visibleCount, pinCount, ciCount,
  isDark, onThemeToggle,
}) {
  return (
    <header className="h-[52px] bg-panel border-b border-rim flex items-center
      px-4 gap-3 flex-shrink-0 z-50 overflow-x-auto">

      {/* Brand */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div
          className="w-7 h-7 flex-shrink-0"
          style={{
            background: "conic-gradient(from 0deg, #f5a623, #ff6b00, #f5a623)",
            clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
            animation: "spin 8s linear infinite",
          }}
        />
        <span className="font-display text-[14px] font-extrabold tracking-[0.06em] uppercase whitespace-nowrap">
          C&amp;I <span className="text-accent">GIS</span>
        </span>
      </div>

      <div className="w-px h-7 bg-rim flex-shrink-0" />

      {/* Mode tools */}
      <div className="flex gap-1">
        <ToolButton active={mode === "explore"} onClick={() => onModeChange("explore")}>
          <span className="w-[7px] h-[7px] rounded-full bg-current" />
          Explore
        </ToolButton>
        <ToolButton active={mode === "buffer"} onClick={() => onModeChange("buffer")}>
          ◎ Buffer
        </ToolButton>
        <ToolButton active={mode === "measure"} onClick={() => onModeChange("measure")}>
          ↔ Measure
        </ToolButton>
        <ToolButton onClick={onNearestGenco}>
          ⚡ Nearest GenCo
        </ToolButton>
      </div>

      <div className="w-px h-7 bg-rim flex-shrink-0" />

      {/* Utility tools */}
      <div className="flex gap-1">
        <ToolButton onClick={onClear}>✕ Clear</ToolButton>
        <ToolButton onClick={onExport}>↓ Export GeoJSON</ToolButton>
      </div>

      {/* Right side: KPIs + theme toggle */}
      <div className="ml-auto flex gap-4 items-center">
        <KPI value={String(ciCount)}  label="C&I Sites" />
        <KPI value={String(pinCount)} label="Pins" />
        <KPI value={String(visibleCount)} label="On Map" />

        <div className="w-px h-7 bg-rim flex-shrink-0" />
        <ThemeToggle isDark={isDark} onToggle={onThemeToggle} />
      </div>
    </header>
  );
}

