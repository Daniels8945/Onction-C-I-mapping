import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MapPin, Crosshair } from "@phosphor-icons/react";
import Topbar         from "./components/Topbar";
import Sidebar        from "./components/Sidebar";
import MapView        from "./components/MapView";
import MapLegend      from "./components/MapLegend";
import LocationFinder from "./components/LocationFinder";
import StatusBar      from "./components/StatusBar";
import LocationPanelHeader from "./components/LocationPanelHeader";
import CommandPalette from "./features/explore/CommandPalette";
import ScanCard       from "./features/explore/ScanCard";
import useSiteScan    from "./features/explore/useSiteScan";
import useFeederLive  from "./features/feeders/useFeederLive";
import usePointRoute  from "./features/explore/usePointRoute";
import RouteCard      from "./features/explore/RouteCard";
import { buildPlaceIndex } from "./features/explore/places";
import useConnect     from "./features/connect/useConnect";
import ConnectCard    from "./features/connect/ConnectCard";
import CustomerSearch from "./features/connect/CustomerSearch";
import useNigeriaMap  from "./hooks/useNigeriaMap";
import useDockablePanel from "./hooks/useDockablePanel";
import { TooltipProvider } from "@/components/ui/tooltip";

// OpenFreeMap — free vector basemaps, no API key required.
const BASEMAP = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark:  "https://tiles.openfreemap.org/styles/fiord",
};

export default function App() {
  // Dark theme by default — this is an ops-console tool, not a marketing page
  const [isDark,       setIsDark]       = useState(true);
  // Below the `sm` breakpoint the sidebar becomes a full overlay rather than
  // pushing the map — default it closed there so the map is what you see
  // first, matching the desktop default of open.
  const [sidebarOpen,  setSidebarOpen]  = useState(() =>
    typeof window === "undefined" || !window.matchMedia("(max-width: 639px)").matches
  );
  const mapAreaRef  = useRef(null);
  const finderCardRef = useRef(null);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  // Add Location: floating over the map, docked in the sidebar, or closed.
  const finder = useDockablePanel({
    storageKey: "gis:location-panel", mapAreaRef, cardRef: finderCardRef, sidebarOpen, openSidebar,
  });

  const {
    containerRef, mapRef, mapReady, coords, zoom, getGridSubstations,
    layerVis, toggleLayer,
    selectedFeature, analysisText, bufferCount,
    pins, addPin, flyToPin, removePin, clearPins,
    exportGeoJSON,
    gridStatus, gridError, gridParties, gridLossModels, gridAtccScenarios,
    gridRouteResult, gridBestSource, gridPresetGenco, gridPresetDest, gridNearby,
    computeGridRoute, computeGridBestSource, clearGridRoute, applyCustomRoute,
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

  // ── Explore: command palette + site scanner ──────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false);
  const feeder = useFeederLive(); // live DisCo feeder data, or the labelled snapshot
  const locate = useCallback((name, kind) => {
    const list = kind === "substation" ? getGridSubstations() : gridParties.gencos;
    const hit = list.find(x => x.name === name);
    return hit && hit.lat != null ? { lat: hit.lat, lon: hit.lon } : null;
  }, [getGridSubstations, gridParties]);
  const scanner = useSiteScan({ mapRef, mapReady, locate, offtakers: gridParties.offtakers, getSubstations: getGridSubstations });

  // Point-to-point routing (Explore → "A to B"). Only one Explore card is
  // open at a time: starting a route closes the scan and vice versa.
  const planner = usePointRoute({ mapRef, mapReady, getSubstations: getGridSubstations, offtakers: gridParties.offtakers });
  const placeIndex = useMemo(
    () => buildPlaceIndex({ gridParties, substations: gridStatus === "ready" ? getGridSubstations() : [], pins }),
    [gridParties, gridStatus, getGridSubstations, pins]);
  // Connect a customer — the central workflow: find them, see what
  // infrastructure is near, visualise the connection, get an indication.
  const connect = useConnect({ mapRef, mapReady });

  const startRoute = (from = null, to = null) => { connect.close(); scanner.clear(); scanner.disarm(); planner.start(from, to); };
  const scanPlace = (lat, lng, label) => { connect.close(); planner.close(); scanner.scanAt(lat, lng, label); };
  const findCustomer = (place, opts) => { scanner.clear(); scanner.disarm(); planner.close(); connect.setCustomer(place, opts); };
  const dropCustomerPin = () => { scanner.clear(); scanner.disarm(); planner.close(); connect.startDrop(); };
  const customerPlace = () => connect.customer && {
    kind: "site", name: connect.label || connect.customer.name || "Customer", lat: connect.customer.lat, lng: connect.customer.lng, state: connect.customer.state,
  };
  const scanSitePlace = () => {
    const s = scanner.scan;
    return s && { kind: "site", name: s.label || s.location?.place || `${s.lat.toFixed(3)}, ${s.lng.toFixed(3)}`, lat: s.lat, lng: s.lng };
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(o => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const routeFromScan = (best) => {
    const s = scanner.scan;
    if (!best || !s) return;
    const label = s.label || s.location?.place || "Scanned site";
    computeGridRoute({ genco: best.genco, lat: s.lat, lng: s.lng, label });
    setSidebarOpen(true); // the route's numbers land in the sidebar calculator
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col bg-background text-foreground" style={{ height: "100%" }}>
      <Topbar
        onExplore={() => (scanner.armed ? scanner.disarm() : setPaletteOpen(true))}
        scanArmed={scanner.armed}
        onExport={exportGeoJSON}
        gridParties={gridParties}
        feeder={feeder}
        isDark={isDark}
        onThemeToggle={handleThemeToggle}
      />
      <CommandPalette
        open={paletteOpen} onOpenChange={setPaletteOpen}
        gridParties={gridParties} substations={gridStatus === "ready" ? getGridSubstations() : []} pins={pins}
        onArm={() => { connect.close(); planner.close(); scanner.arm(); }} onScan={scanPlace} onRoute={startRoute}
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
          gridNearby={gridNearby}
          onComputeGridRoute={computeGridRoute}
          onComputeGridBestSource={computeGridBestSource}
          onClearGridRoute={clearGridRoute}
          onApplyCustomRoute={applyCustomRoute}
          dockedPanel={finder.mode === "docked" && (
            <div data-testid="location-finder-docked">
              <LocationPanelHeader docked onDragStart={finder.startDrag} onFloat={finder.float} onClose={finder.close} />
              <div className="mx-3 rounded-md border border-border">
                <LocationFinder onAddPin={addPin} />
              </div>
            </div>
          )}
          dockPreview={finder.overSidebar && finder.mode === "floating"}
        />

        {/* Map area */}
        <div ref={mapAreaRef} className="flex-1 relative flex flex-col min-h-0">
          <div className="flex-1 relative min-h-0">
            <MapView containerRef={containerRef} />
          </div>

          {/* LocationFinder floating card — drag its header onto the sidebar to dock it */}
          <AnimatePresence>
            {mapReady && finder.mode === "floating" && (
              <motion.div
                ref={finderCardRef}
                data-testid="location-finder-card"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: finder.overSidebar ? 0.6 : 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
                transition={{ duration: finder.dragging ? 0.1 : 0.25, ease: "easeOut" }}
                className={`absolute w-[220px] rounded-lg border border-border backdrop-blur-sm shadow-xl
                  ${finder.dragging ? "z-[60]" : "z-[25]"} ${finder.pos ? "" : "bottom-10 left-4"}`}
                style={{
                  background: "color-mix(in srgb, hsl(var(--card)) 95%, transparent)",
                  ...(finder.pos && { left: finder.pos.x, top: finder.pos.y }),
                }}
              >
                <LocationPanelHeader
                  onDragStart={finder.startDrag} onDock={finder.dock} onClose={finder.close}
                />
                <LocationFinder onAddPin={addPin} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Closed — a small button brings it back where it was */}
          {mapReady && finder.mode === "closed" && (
            <button
              type="button"
              onClick={finder.float}
              title="Add Location"
              aria-label="Open Add Location"
              className="absolute bottom-10 left-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg hover:text-primary transition-colors"
            >
              <MapPin className="h-4 w-4" />
            </button>
          )}

          {/* Armed hint */}
          <AnimatePresence>
            {scanner.armed && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="pointer-events-none absolute left-1/2 top-3 z-[27] flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/40 bg-card/95 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur"
              >
                <Crosshair className="h-3.5 w-3.5 text-primary" weight="bold" />
                Click anywhere on the map to scan it
                <kbd className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">Esc</kbd>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scan result */}
          <AnimatePresence>
            {scanner.scan && (
              <ScanCard
                key={`${scanner.scan.lat},${scanner.scan.lng}`}
                scan={scanner.scan}
                feeder={feeder}
                onClose={scanner.clear}
                onRescan={() => { scanner.clear(); scanner.arm(); }}
                onRoute={routeFromScan}
                onPin={() => addPin(scanner.scan.lng, scanner.scan.lat, scanner.scan.label || scanner.scan.location?.place || "Scanned site")}
                onPlanRoute={() => startRoute(scanSitePlace(), null)}
              />
            )}
          </AnimatePresence>

          {/* Connect a customer: search bar + card */}
          {mapReady && (
            <CustomerSearch index={placeIndex} onSelect={findCustomer} onDropPin={dropCustomerPin} dropping={connect.dropping} />
          )}
          <AnimatePresence>
            {connect.open && (
              <ConnectCard
                connect={connect}
                onClose={connect.close}
                onSources={() => { const p = customerPlace(); if (p) scanPlace(p.lat, p.lng, p.name); }}
                onRoute={() => startRoute(null, customerPlace())}
                onPin={() => { const p = customerPlace(); if (p) addPin(p.lng, p.lat, p.name); }}
              />
            )}
          </AnimatePresence>

          {/* Point-to-point route */}
          <AnimatePresence>
            {planner.open && (
              <RouteCard
                planner={planner} index={placeIndex} feeder={feeder}
                onClose={planner.close}
                onScan={(p) => scanPlace(p.lat, p.lng, p.name)}
              />
            )}
          </AnimatePresence>

          {mapReady && <MapLegend />}
        </div>
      </div>

      <StatusBar coords={coords} zoom={zoom} bufferCount={bufferCount} />
    </div>
    </TooltipProvider>
  );
}
