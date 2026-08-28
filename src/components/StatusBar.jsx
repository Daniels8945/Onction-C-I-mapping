export default function StatusBar({ coords, zoom, bufferCount }) {
  return (
    <div className="flex items-center gap-4 px-4 h-7 border-t border-border bg-card flex-shrink-0 z-20">
      <span className="text-[9px] font-mono text-muted-foreground tabular-nums">{coords || "Move cursor over map"}</span>
      <span className="text-[9px] font-mono text-muted-foreground ml-auto tabular-nums">Zoom {zoom.toFixed(1)}</span>
      {bufferCount > 0 && <span className="text-[9px] text-primary">{bufferCount} buffer{bufferCount > 1 ? "s" : ""}</span>}
    </div>
  );
}
