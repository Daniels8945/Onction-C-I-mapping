import { useState } from "react";
import { Eye, EyeSlash, Pause, Play, ArrowCounterClockwise, Target, X, StackSimple, CaretDown } from "@phosphor-icons/react";

// "What do I want to see?" — the Connect view's layer and animation
// controls. Presentation only: hiding a layer changes the map, never the
// assessment (the card keeps listing everything). Categories + All on / All
// off / Reset, the energy-flow player, and "only this connection".

const INFRA = [
  { key: "kv330", label: "330 kV" },
  { key: "kv132", label: "132 kV" },
  { key: "substations", label: "Substations" },
  { key: "customer", label: "Customer" },
];
const VISUAL = [
  { key: "connection", label: "Connection" },
  { key: "flow", label: "Energy flow" },
  { key: "labels", label: "Labels" },
  { key: "radius", label: "Radius" },
];

function Toggle({ k, label, on, onClick }) {
  const Icon = on ? Eye : EyeSlash;
  return (
    <button onClick={onClick} aria-pressed={on} data-testid={`layer-${k}`}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors
              ${on ? "border-primary/50 bg-primary/12 text-foreground" : "border-border text-muted-foreground line-through decoration-muted-foreground/50 hover:text-foreground"}`}
            style={on ? { background: "hsl(var(--primary) / 0.12)" } : undefined}>
      <Icon className={`h-3.5 w-3.5 ${on ? "text-primary" : ""}`} />{label}
    </button>
  );
}

const IconBtn = ({ label, onClick, disabled, children, testid }) => (
  <button onClick={onClick} disabled={disabled} aria-label={label} title={label} data-testid={testid}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
    {children}
  </button>
);

export default function ConnectViewControls({ connect }) {
  const { view, selected } = connect;
  const [open, setOpen] = useState(() => !window.matchMedia("(max-width: 639px)").matches);
  const allOn = [...INFRA, ...VISUAL].every(c => view[c.key]);
  const allOff = [...INFRA, ...VISUAL].every(c => !view[c.key]);
  const flowLive = view.flow && view.connection && !!selected;

  return (
    <div data-testid="view-controls"
         className="absolute right-3 top-[64px] z-[27] w-[min(340px,calc(100%-1.5rem))] rounded-xl border border-border shadow-2xl backdrop-blur-md
                    sm:top-auto sm:bottom-10 sm:right-auto sm:left-[424px] sm:w-auto sm:max-w-[calc(100%-440px)]"
         style={{ background: "color-mix(in srgb, hsl(var(--card)) 95%, transparent)" }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground">
          <StackSimple className="h-3.5 w-3.5 text-primary" /> Map layers <CaretDown className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <span className="flex-1" />
        <div className="flex items-center gap-1 text-[10.5px]">
          <button onClick={() => connect.allLayers(true)} disabled={allOn} data-testid="layers-all-on" className="rounded px-1.5 py-0.5 font-semibold text-foreground hover:bg-accent disabled:text-muted-foreground disabled:hover:bg-transparent">All on</button>
          <span className="text-border">|</span>
          <button onClick={() => connect.allLayers(false)} disabled={allOff} data-testid="layers-all-off" className="rounded px-1.5 py-0.5 font-semibold text-foreground hover:bg-accent disabled:text-muted-foreground disabled:hover:bg-transparent">All off</button>
          <span className="text-border">|</span>
          <button onClick={connect.resetView} data-testid="layers-reset" className="rounded px-1.5 py-0.5 font-semibold text-foreground hover:bg-accent">Reset</button>
        </div>
      </div>

      {open && (
        <div className="space-y-2 border-t border-border px-3 pb-2.5 pt-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-[92px] text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Infrastructure</span>
            {INFRA.map(c => <Toggle key={c.key} k={c.key} label={c.label} on={view[c.key]} onClick={() => connect.toggleLayer(c.key)} />)}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-[92px] text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Visualization</span>
            {VISUAL.map(c => (
              <span key={c.key} className="flex items-center gap-1">
                <Toggle k={c.key} label={c.label} on={view[c.key]} onClick={() => connect.toggleLayer(c.key)} />
                {c.key === "flow" && (
                  <>
                    <IconBtn label={view.flowPaused ? "Resume energy flow" : "Pause energy flow"} onClick={connect.toggleFlowPause} disabled={!flowLive} testid="flow-pause">
                      {view.flowPaused ? <Play className="h-3 w-3" weight="fill" /> : <Pause className="h-3 w-3" weight="fill" />}
                    </IconBtn>
                    <IconBtn label="Restart energy flow" onClick={connect.resetFlow} disabled={!flowLive} testid="flow-reset"><ArrowCounterClockwise className="h-3 w-3" /></IconBtn>
                  </>
                )}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={connect.toggleFocus} aria-pressed={view.focus} disabled={!selected} data-testid="layer-focus"
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-40
                      ${view.focus ? "border-amber-500/60 bg-amber-500/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
              <Target className="h-3.5 w-3.5 text-amber-500" /> Only this connection
            </button>
            <button onClick={connect.clearSelection} disabled={!selected} data-testid="clear-selection"
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40">
              <X className="h-3.5 w-3.5" /> Clear selection
            </button>
            {view.hidden.length > 0 && (
              <button onClick={connect.showAllHidden} data-testid="show-hidden" className="text-[10.5px] text-primary hover:underline">
                {view.hidden.length} substation{view.hidden.length > 1 ? "s" : ""} hidden · show
              </button>
            )}
          </div>
          <p className="text-[9.5px] leading-snug text-muted-foreground/80">Layers only change what the map shows — the analysis always uses all the infrastructure.</p>
        </div>
      )}
    </div>
  );
}
