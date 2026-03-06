// App.jsx — Root component
import { useState, useEffect, useCallback } from "react";
import useNigeriaMap from "./hooks/useNigeriaMap";
import { CI_CUSTOMERS, DISCOS, GENCOS, TRANSMISSION } from "./data";
import Topbar    from "./components/Topbar";
import Sidebar   from "./components/Sidebar";
import MapView   from "./components/MapView";
import StatusBar from "./components/StatusBar";

// CartoDB basemap tiles — dark and light variants
const BASEMAP = {
  dark:  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  light: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
};

export default function App() {
  // ── Theme ────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.remove("light");
    } else {
      html.classList.add("light");
    }
  }, [isDark]);

  // Switch map basemap tiles when theme changes
  const handleThemeToggle = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      // Update the raster source tiles directly on the live map
      // mapRef is inside the hook, so we use a custom event to signal it
      window.dispatchEvent(new CustomEvent("gis:theme", { detail: { dark: next } }));
      return next;
    });
  }, []);

  // ── Map hook ─────────────────────────────────────────────────
  const {
    containerRef, mapReady,
    coords, zoom,
    mode, changeMode,
    layerVis, toggleLayer,
    selectedFeature,
    analysisText, bufferCount,
    pins, addPin, flyToPin, removePin, clearPins,
    runNearestGenco,
    clearAnalysis,
    exportGeoJSON,
    searchAndFly,
  } = useNigeriaMap({ isDark, BASEMAP });

  // ── Visible feature count for KPI ────────────────────────────
  const visibleCount =
    (layerVis.ci           ? CI_CUSTOMERS.length  : 0) +
    (layerVis.discos       ? DISCOS.length        : 0) +
    (layerVis.gencos       ? GENCOS.length        : 0) +
    (layerVis.transmission ? TRANSMISSION.length  : 0);

  return (
    <div className="font-mono bg-surface text-light w-full h-full flex flex-col overflow-hidden">
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

      {/* min-h-0 is required on flex column children to allow them to shrink */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          layerVis={layerVis}
          toggleLayer={toggleLayer}
          selectedFeature={selectedFeature}
          analysisText={analysisText}
          bufferCount={bufferCount}
          pins={pins}
          onAddPin={addPin}
          onFlyToPin={flyToPin}
          onRemovePin={removePin}
          onClearPins={clearPins}
          onSearch={searchAndFly}
        />
        <MapView containerRef={containerRef} mapReady={mapReady} />
      </div>

      <StatusBar coords={coords} zoom={zoom} mode={mode} />
    </div>
  );
}

