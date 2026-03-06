// components/Sidebar.jsx
import { DISCOS, GENCOS, CI_CUSTOMERS, GEOPOLITICAL_ZONES } from "../data";
import SectionTitle   from "./ui/SectionTitle";
import LayerRow       from "./ui/LayerRow";
import LocationFinder from "./LocationFinder";
import InfoCard       from "./InfoCard";
import AnalysisBox    from "./AnalysisBox";

export default function Sidebar({
  layerVis, toggleLayer,
  selectedFeature, analysisText, bufferCount,
  pins, onAddPin, onFlyToPin, onRemovePin, onClearPins,
  onSearch,
}) {
  return (
    <aside className="w-[272px] bg-panel border-r border-rim flex flex-col flex-shrink-0 overflow-hidden">

      {/* ── Search ──────────────────────────────────────────── */}
      <div className="p-2.5 border-b border-rim">
        <div className="flex items-center gap-2 bg-surface border border-rim rounded-md px-2.5
          focus-within:border-accent transition-colors duration-150">
          <svg className="w-3 h-3 text-slate flex-shrink-0 opacity-50" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className="flex-1 bg-transparent border-none outline-none text-light
              font-mono text-[11px] py-2 placeholder:text-slate/50"
            placeholder="Search C&I customer, state…"
            autoComplete="off"
            onChange={e => onSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Scrollable content ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-4
        scrollbar-thin scrollbar-track-transparent scrollbar-thumb-rim2">

        {/* ── PRIMARY: C&I Customers ─────────────────────── */}
        <SectionTitle>C&amp;I Customers</SectionTitle>
        <div className="px-1">
          <LayerRow
            colorDot="#7c6af8"
            label="C&amp;I Anchor Loads"
            badge={CI_CUSTOMERS.length}
            on={layerVis.ci}
            onClick={() => toggleLayer("ci")}
          />
        </div>

        {/* ── REFERENCE: Infrastructure ─────────────────── */}
        <SectionTitle>Reference Layers</SectionTitle>
        <div className="px-1">
          <LayerRow colorDot="#3a5a80"  label="State Boundaries"    badge="36"             on={layerVis.states}       onClick={() => toggleLayer("states")} />
          <LayerRow colorDot="#2a3a5c"  label="Geopolitical Zones"  badge="6"              on={layerVis.zones}        onClick={() => toggleLayer("zones")} />
          <LayerRow colorDot="#f5a623"  label="DISCO HQs"           badge={DISCOS.length}  on={layerVis.discos}       onClick={() => toggleLayer("discos")} />
          <LayerRow colorDot="#00e5a0"  label="GenCo Plants"        badge={GENCOS.length}  on={layerVis.gencos}       onClick={() => toggleLayer("gencos")} />
          <LayerRow colorDot="#e05252"  label="Transmission Lines"  badge="12"             on={layerVis.transmission} onClick={() => toggleLayer("transmission")} />
          <LayerRow colorDot="#00e5a080" label="Analysis Buffers"   badge={bufferCount}    on={layerVis.buffers}      onClick={() => toggleLayer("buffers")} />
        </div>

        {/* ── PIN A LOCATION ────────────────────────────── */}
        <SectionTitle>Pin a Location</SectionTitle>
        <LocationFinder onAddPin={onAddPin} />

        {/* ── PINNED LOCATIONS ──────────────────────────── */}
        {pins.length > 0 && (
          <>
            <SectionTitle>
              Pinned Locations
              <button
                onClick={onClearPins}
                className="ml-auto text-[8px] text-slate hover:text-danger transition-colors
                  uppercase tracking-widest cursor-pointer border-none bg-transparent"
              >
                Clear all
              </button>
            </SectionTitle>

            <div className="mx-3 bg-elevated border border-rim rounded-lg overflow-hidden">
              {pins.map((pin, i) => (
                <div key={pin.id}
                  className={`flex items-center gap-2 px-2.5 py-2 group
                    hover:bg-rim transition-colors duration-100
                    ${i < pins.length - 1 ? "border-b border-rim" : ""}`}
                >
                  {/* Pin icon */}
                  <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full rounded-br-none rotate-[-45deg]
                      bg-accent flex-shrink-0" />
                  </div>

                  {/* Label + coords */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => onFlyToPin(pin)}
                  >
                    <p className="text-[10px] font-semibold text-light truncate leading-tight">
                      {pin.label}
                    </p>
                    <p className="text-[9px] text-slate leading-tight">
                      {pin.lat.toFixed(4)}°N, {pin.lng.toFixed(4)}°E
                    </p>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => onRemovePin(pin.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity
                      text-slate hover:text-danger text-[14px] cursor-pointer
                      border-none bg-transparent leading-none flex-shrink-0"
                    title="Remove pin"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── SELECTED FEATURE ──────────────────────────── */}
        <SectionTitle>Selected Feature</SectionTitle>
        <InfoCard feature={selectedFeature} />

        {/* ── GIS ANALYSIS ──────────────────────────────── */}
        <SectionTitle>GIS Analysis</SectionTitle>
        <AnalysisBox text={analysisText} />

        {/* ── ZONE LEGEND ───────────────────────────────── */}
        <SectionTitle>Zone Legend</SectionTitle>
        <div className="mx-3 pb-2">
          {Object.entries(GEOPOLITICAL_ZONES).map(([zone, data]) => (
            <div key={zone}
              className="flex items-center gap-2 py-1 text-[10px] text-light border-b border-rim last:border-0">
              <div className="w-5 h-2 rounded-[2px] flex-shrink-0" style={{ background: data.color }} />
              {zone}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

