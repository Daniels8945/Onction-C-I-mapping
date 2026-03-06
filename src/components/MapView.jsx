// components/MapView.jsx
export default function MapView({ containerRef, mapReady }) {
  return (
    // flex-1 min-h-0 ensures this column flex child actually fills available height
    <div className="flex-1 min-h-0 relative" style={{ minWidth: 0 }}>

      {/* MapLibre canvas target — inline style guarantees 100% fill even if
          Tailwind Preflight or any upstream CSS disrupts the cascade */}
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      {/* Loading overlay */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center
          z-10 transition-opacity duration-700 pointer-events-none bg-surface
          ${mapReady ? "opacity-0" : "opacity-100"}`}
      >
        <div className="w-11 h-11 rounded-full border-2 border-rim border-t-accent animate-spin" />
        <p className="font-display text-[11px] tracking-[0.18em] uppercase text-slate mt-4">
          Loading Nigeria GIS
        </p>
      </div>
    </div>
  );
}
