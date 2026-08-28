import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { MapPin, DotsSixVertical } from "@phosphor-icons/react";
import Topbar         from "./components/Topbar";
import Sidebar        from "./components/Sidebar";
import MapView        from "./components/MapView";
import LocationFinder from "./components/LocationFinder";
import StatusBar      from "./components/StatusBar";
import useNigeriaMap  from "./hooks/useNigeriaMap";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CI_CUSTOMERS } from "./data";

// OpenFreeMap — free vector basemaps, no API key required.
const BASEMAP = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark:  "https://tiles.openfreemap.org/styles/fiord",
};

export default function App() {
  // Dark theme by default — this is an ops-console tool, not a marketing page
  const [isDark,       setIsDark]       = useState(true);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const mapAreaRef  = useRef(null);
  const dragControls = useDragControls();

  const {
    containerRef, mapReady, coords, zoom,
    mode, changeMode,
    layerVis, toggleLayer,
    selectedFeature, analysisText, bufferCount,
    pins, addPin, flyToPin, removePin, clearPins,
    runNearestGenco, clearAnalysis, exportGeoJSON,
    gridStatus, gridError, gridParties, gridLossModels, gridAtccScenarios,
    gridRouteResult, gridBestSource, gridPresetGenco, gridPresetDest,
    computeGridRoute, computeGridBestSource, clearGridRoute,
  } = useNigeriaMap({ isDark, BASEMAP });

  // Sync theme class + basemap on <html> whenever isDark actually changes.
  // The map already starts on the correct style (see the map-init effect), so this must
  // NOT fire on the initial mount too — a redundant same-URL setStyle() there can race
  // with its own "style.load" listener and permanently strand the map on the bare basemap
  // with none of our data layers (no error, just a silently missed event). Comparing against
  // the last-seen value (not a run-once flag) also survives React StrictMode's double-invoke
  // of this same effect in dev, which would otherwise dispatch on the second call anyway.
  const lastIsDark = useRef(isDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    if (lastIsDark.current === isDark) return;
    lastIsDark.current = isDark;
    window.dispatchEvent(new CustomEvent("gis:theme", { detail: { dark: isDark } }));
  }, [isDark]);

  const handleThemeToggle = () => setIsDark(d => !d);

  const visibleCount = Object.values(layerVis).filter(Boolean).length;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col bg-background text-foreground" style={{ height: "100%" }}>
      <Topbar
        mode={mode}
        onModeChange={changeMode}
        onNearestGenco={runNearestGenco}
        onClear={clearAnalysis}
        onExport={exportGeoJSON}
        visibleCount={visibleCount}
        pinCount={pins.length}
        ciCount={CI_CUSTOMERS.length}
        isDark={isDark}
        onThemeToggle={handleThemeToggle}
      />

      {/* Workspace */}
      <div className="flex flex-1 min-h-0 relative">

        {/* Collapsible Sidebar */}
        <Sidebar
          layerVis={layerVis}
          toggleLayer={toggleLayer}
          selectedFeature={selectedFeature}
          analysisText={analysisText}
          pins={pins}
          onFlyToPin={flyToPin}
          onRemovePin={removePin}
          onClearPins={clearPins}
          isCollapsed={!sidebarOpen}
          onToggleCollapse={() => setSidebarOpen(o => !o)}
          gridStatus={gridStatus}
          gridError={gridError}
          gridParties={gridParties}
          gridLossModels={gridLossModels}
          gridAtccScenarios={gridAtccScenarios}
          gridRouteResult={gridRouteResult}
          gridBestSource={gridBestSource}
          gridPresetGenco={gridPresetGenco}
          gridPresetDest={gridPresetDest}
          onComputeGridRoute={computeGridRoute}
          onComputeGridBestSource={computeGridBestSource}
          onClearGridRoute={clearGridRoute}
        />

        {/* Map area */}
        <div ref={mapAreaRef} className="flex-1 relative flex flex-col min-h-0">
          <div className="flex-1 relative min-h-0">
            <MapView containerRef={containerRef} />
          </div>

          {/* LocationFinder floating card — draggable by its header */}
          <AnimatePresence>
            {mapReady && (
              <motion.div
                data-testid="location-finder-card"
                drag
                dragControls={dragControls}
                dragListener={false}
                dragMomentum={false}
                dragElastic={0}
                dragConstraints={mapAreaRef}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="absolute bottom-10 left-4 w-[220px] rounded-lg border border-border backdrop-blur-sm shadow-xl z-10"
                style={{ background: "color-mix(in srgb, hsl(var(--card)) 95%, transparent)" }}
              >
                <div
                  onPointerDown={(e) => dragControls.start(e)}
                  className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 border-b border-border rounded-t-lg cursor-grab active:cursor-grabbing select-none"
                >
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <p className="flex-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Add Location</p>
                  <DotsSixVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                </div>
                <LocationFinder onAddPin={addPin} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <StatusBar coords={coords} zoom={zoom} bufferCount={bufferCount} />
    </div>
    </TooltipProvider>
  );
}
