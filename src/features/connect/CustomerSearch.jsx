import { useState, useMemo, useEffect, useRef } from "react";
import { MagnifyingGlass, CircleNotch, MapPin, PushPinSimple, X, Buildings, Factory, Lightning, Plug, Power, PushPin } from "@phosphor-icons/react";
import usePlaceSearch, { placeSubtitle } from "@/lib/usePlaceSearch";
import { searchPlaces, KIND_LABEL } from "@/features/explore/places";

// The front door of the Connect workflow: "I have a customer at …".
// Searches Onction's own records first (offtakers, C&I loads, GenCos,
// substations) and then businesses / estates / addresses / settlements via
// the server geocoder, with the confidence of each match. Coordinates work
// too ("6.82, 3.63"), and "Drop a pin" covers places no source knows.

const KIND_ICON = { genco: Lightning, plant: Power, offtaker: Factory, substation: Plug, disco: Buildings, ci: Factory, pin: PushPin };
const CONF = {
  high:   { label: "High",   cls: "bg-emerald-500/15 text-emerald-500" },
  medium: { label: "Medium", cls: "bg-amber-500/15 text-amber-500" },
  low:    { label: "Low",    cls: "bg-red-500/15 text-red-400" },
};
const PRECISION = { site: "Site", address: "Street", area: "Area", feature: "Feature" };

export function ConfidenceBadge({ confidence, precision }) {
  const c = CONF[confidence];
  if (!c) return null;
  return (
    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider ${c.cls}`}>
      {c.label}{precision ? ` · ${PRECISION[precision] || precision}` : ""}
    </span>
  );
}

export default function CustomerSearch({ index, onSelect, onDropPin, dropping, compact }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const q = text.trim();
  const { results, status, stateHint, errors } = usePlaceSearch(q, open && q.length >= 3);

  // "/" focuses the search, like most map apps.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName || "")) { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const records = useMemo(() => (q.length >= 2 ? searchPlaces(index, q, { perKind: 2, limit: 4 }) : []), [index, q]);
  const options = useMemo(() => [
    ...records.map(r => ({ group: "records", ...r, sub: [KIND_LABEL[r.kind], r.sub].filter(Boolean).join(" · ") })),
    ...results.map(r => ({ group: "places", kind: "place", ...r, sub: placeSubtitle(r) })),
    { group: "action", kind: "drop", name: "Drop a pin on the map", sub: "For a site no search knows — click its location" },
  ], [records, results]);
  useEffect(() => { setActive(0); }, [q, results.length]);

  const choose = (o) => {
    if (!o) return;
    setOpen(false);
    inputRef.current?.blur();
    if (o.kind === "drop") { onDropPin(); return; }
    setText(o.name);
    onSelect(o.kind === "place" ? o : {
      name: o.name, address: o.sub, lat: o.lat, lng: o.lng, state: o.state || null, lga: null,
      confidence: "high", confidence_reason: `Onction record (${KIND_LABEL[o.kind]})`, precision: "site", source: "onction",
    }, { name: o.name });
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      // Still searching and nothing to pick yet: don't fall through to
      // "Drop a pin" — wait for the results.
      if (status === "loading" && options[active]?.kind === "drop") return;
      choose(options[active]);
    }
    else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  };

  const noConfident = status === "done" && !results.some(r => r.confidence !== "low") && !records.length;
  let lastGroup = null;

  return (
    <div ref={boxRef} data-testid="customer-search"
         className={`absolute left-3 right-3 top-3 z-[28] sm:right-auto ${compact ? "sm:w-[340px]" : "sm:w-[400px]"}`}>
      <div className={`flex items-center gap-2.5 rounded-xl border bg-card/95 px-3.5 shadow-xl backdrop-blur transition-colors ${open ? "border-primary/60" : "border-border"}`}>
        <MagnifyingGlass className="h-4 w-4 flex-shrink-0 text-primary" weight="bold" />
        <input
          ref={inputRef} value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          placeholder="Find a customer — business, estate, address or coordinates"
          aria-label="Find a customer" role="combobox" aria-expanded={open} aria-controls="customer-results"
          aria-activedescendant={open && options[active] ? `cust-opt-${active}` : undefined}
          className="h-11 min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {status === "loading" && <CircleNotch className="h-4 w-4 animate-spin text-muted-foreground" />}
        {text && (
          <button onClick={() => { setText(""); inputRef.current?.focus(); }} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">/</kbd>
      </div>

      {dropping && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/50 bg-card/95 px-3 py-2 text-[11.5px] text-foreground shadow-lg backdrop-blur">
          <PushPinSimple className="h-3.5 w-3.5 text-primary" weight="bold" /> Click the customer's location on the map
          <kbd className="ml-auto rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">Esc</kbd>
        </div>
      )}

      {open && q.length >= 2 && (
        <div id="customer-results" role="listbox" className="mt-1.5 max-h-[min(65vh,480px)] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-2xl">
          {stateHint && <p className="px-2.5 pb-1 pt-1.5 text-[10px] text-muted-foreground">Searching in <span className="font-semibold text-foreground">{stateHint}</span> first</p>}
          {options.map((o, i) => {
            const header = o.group !== lastGroup ? { records: "Onction records", places: "Places", action: null }[o.group] : null;
            lastGroup = o.group;
            const Icon = o.kind === "place" ? MapPin : o.kind === "drop" ? PushPinSimple : KIND_ICON[o.kind] || MapPin;
            const sel = i === active;
            return (
              <div key={`${o.group}-${o.name}-${i}`}>
                {header && <p className="px-2.5 pb-1 pt-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{header}</p>}
                {o.group === "action" && (
                  <>
                    {status === "loading" && !results.length && <p className="px-2.5 py-2 text-[11px] text-muted-foreground">Searching businesses and addresses…</p>}
                    {noConfident && (
                      <p className="px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                        No confident match{results.length ? " (only weak ones above)" : ""}. Try adding the town or state, or drop a pin.
                      </p>
                    )}
                    {status === "error" && <p className="px-2.5 py-2 text-[11px] text-red-400">Search unavailable: {errors[0]}</p>}
                    <div className="mx-1 my-1 border-t border-border" />
                  </>
                )}
                <div
                  id={`cust-opt-${i}`} role="option" aria-selected={sel}
                  onMouseDown={(e) => { e.preventDefault(); choose(o); }} onMouseMove={(e) => { if (e.movementX || e.movementY) setActive(i); }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2"
                  style={sel ? { background: "hsl(var(--primary) / 0.12)" } : undefined}
                >
                  <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${o.kind === "drop" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">{o.name}</p>
                    {o.sub && <p className="truncate text-[11px] text-muted-foreground">{o.sub}</p>}
                    {o.kind === "place" && o.confidence !== "high" && <p className="truncate text-[10px] text-muted-foreground/80">{o.confidence_reason}</p>}
                  </div>
                  {o.kind === "place" && <ConfidenceBadge confidence={o.confidence} precision={o.precision} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
