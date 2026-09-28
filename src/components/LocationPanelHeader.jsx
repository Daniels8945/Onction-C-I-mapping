import { MapPin, DotsSixVertical, SidebarSimple, ArrowSquareOut, X } from "@phosphor-icons/react";

// Header for the Add Location panel, in both its floating and docked forms.
// The whole bar is the drag handle (see useDockablePanel); the buttons are
// excluded from the drag so they stay plain clicks.
export default function LocationPanelHeader({ docked, onDragStart, onDock, onFloat, onClose }) {
  const iconBtn = "rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors";
  return (
    <div
      onPointerDown={onDragStart}
      title={docked ? "Drag onto the map to float" : "Drag onto the sidebar to dock"}
      className={`flex items-center gap-1.5 select-none cursor-grab active:cursor-grabbing touch-none
        ${docked ? "px-3 pt-4 pb-1.5" : "px-3 pt-2 pb-1.5 border-b border-border rounded-t-lg"}`}
    >
      <DotsSixVertical className="h-3.5 w-3.5 text-muted-foreground/50 -ml-1" />
      <MapPin className="h-3 w-3 text-muted-foreground" />
      <p className="flex-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Add Location</p>
      {docked ? (
        <button type="button" onClick={onFloat} className={iconBtn} title="Pop out onto the map" aria-label="Pop out onto the map">
          <ArrowSquareOut className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button type="button" onClick={onDock} className={iconBtn} title="Dock in sidebar" aria-label="Dock in sidebar">
          <SidebarSimple className="h-3.5 w-3.5" />
        </button>
      )}
      <button type="button" onClick={onClose} className={iconBtn} title="Close" aria-label="Close Add Location">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
