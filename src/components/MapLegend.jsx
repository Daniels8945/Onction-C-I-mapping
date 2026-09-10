import { useState } from "react";
import { CaretUp, CaretDown } from "@phosphor-icons/react";
import { TCN_LOOPS } from "../data";
import { TX_LINE_STATUS, SUBSTATION_STATUS, GENCO_ICONS } from "../data/legend";

function LineSwatch({ color, dashed }) {
  return (
    <svg width="26" height="10" className="flex-shrink-0">
      <line x1="1" y1="5" x2="25" y2="5" stroke={color} strokeWidth="2.5"  strokeLinecap="round" />
    </svg>
  );
}

function RingSwatch({ outer, inner }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="flex-shrink-0">
      <circle cx="9" cy="9" r="7" fill="none" stroke={outer} strokeWidth="1.4" />
      <circle cx="9" cy="9" r="3.8" fill="none" stroke={inner} strokeWidth="1.4" />
    </svg>
  );
}

function ShapeSwatch({ shape, color }) {
  const common = { fill: `${color}22`, stroke: color, strokeWidth: 1.4, strokeLinejoin: "round" };
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="flex-shrink-0">
      {shape === "square" && <rect x="4" y="4" width="10" height="10" {...common} />}
      {shape === "triangle" && <polygon points="9,2.5 15.5,15 2.5,15" {...common} />}
      {shape === "pentagon" && <polygon points="9,1.5 16,6.8 13.3,14.8 4.7,14.8 2,6.8" {...common} />}
    </svg>
  );
}

function LegendRow({ swatch, label }) {
  return (
    <div className="flex items-center gap-2">
      {swatch}
      <span className="text-[9.5px] leading-tight text-foreground/80">{label}</span>
    </div>
  );
}

// Static reference key for the TCN Loop Map — every color/shape here is
// imported from src/data/legend.js, the same constants the map itself paints
// with, so this panel can never drift out of sync with what's actually drawn.
export default function MapLegend() {
  const [collapsed, setCollapsed] = useState(false);
  const existingLoops = TCN_LOOPS.filter(l => l.status !== "ongoing");
  const ongoingLoops  = TCN_LOOPS.filter(l => l.status === "ongoing");

  return (
    <div
      className={`absolute top-24 right-4 z-20 flex w-[235px] flex-col rounded-lg border border-border shadow-xl backdrop-blur-sm ${collapsed ? "" : "bottom-16"}`}
      style={{ background: "color-mix(in srgb, hsl(var(--card)) 95%, transparent)" }}
    >
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex flex-shrink-0 items-center gap-1.5 rounded-t-lg border-b border-border px-3 py-2 text-left"
      >
        <span className="flex-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">TCN Loop Map Legend</span>
        {collapsed ? <CaretDown className="h-3 w-3 text-muted-foreground" /> : <CaretUp className="h-3 w-3 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-2.5">
          <div className="space-y-1">
            <p className="text-[9px] font-bold uppercase tracking-wide text-red-500">Existing</p>
            <div className="space-y-1.5">
              {existingLoops.map(loop => (
                <LegendRow key={loop.id} swatch={<LineSwatch color={loop.color} />} label={loop.name} />
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[9px] font-bold uppercase tracking-wide text-red-500">Ongoing</p>
            <div className="space-y-1.5">
              {ongoingLoops.map(loop => (
                <LegendRow key={loop.id} swatch={<LineSwatch color={loop.color} dashed />} label={loop.name} />
              ))}
            </div>
          </div>

          <div className="space-y-1.5 border-t border-border pt-2.5">
            {TX_LINE_STATUS.map(row => (
              <LegendRow key={row.key} swatch={<LineSwatch color={row.color} />} label={row.label} />
            ))}
          </div>

          <div className="space-y-1.5 border-t border-border pt-2.5">
            {SUBSTATION_STATUS.map(row => (
              <LegendRow key={row.key} swatch={<RingSwatch outer={row.outer} inner={row.inner} />} label={row.label} />
            ))}
          </div>

          <div className="space-y-1.5 border-t border-border pt-2.5">
            {GENCO_ICONS.map(row => (
              <LegendRow key={row.key} swatch={<ShapeSwatch shape={row.shape} color={row.color} />} label={row.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
