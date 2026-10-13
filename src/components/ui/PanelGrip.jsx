import { DotsSixVertical, ArrowCounterClockwise } from "@phosphor-icons/react";

// The drag handle for a movable map panel (see useMovablePanel), plus a
// "put it back" button that appears once the panel has been moved.
export default function PanelGrip({ panel, name, className = "" }) {
  return (
    <span className={`flex flex-shrink-0 items-center ${className}`}>
      <span {...panel.gripProps} aria-label={`Move ${name} (drag, or use the arrow keys)`} data-testid={`grip-${name.toLowerCase().replace(/\s+/g, "-")}`}
            className={`-m-1 flex items-center rounded p-1 text-muted-foreground/60 hover:bg-accent/60 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary
              ${panel.dragging ? "cursor-grabbing" : "cursor-grab"}`}>
        <DotsSixVertical className="h-3.5 w-3.5" weight="bold" />
      </span>
      {panel.moved && (
        <button type="button" onClick={panel.reset} aria-label={`Put ${name} back`} title="Put back"
                className="ml-0.5 rounded p-0.5 text-muted-foreground/70 hover:bg-accent/60 hover:text-foreground">
          <ArrowCounterClockwise className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
