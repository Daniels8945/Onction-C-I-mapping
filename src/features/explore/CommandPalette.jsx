import { useState, useMemo, useEffect, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  MagnifyingGlass, Crosshair, Lightning, Buildings, Factory, Plug, MapPin, PushPin, CircleNotch, ArrowElbowDownLeft,
  Path, Power,
} from "@phosphor-icons/react";
import { useDebouncedAddressSearch, shortLabel } from "@/components/LocationFinder";
import { buildPlaceIndex, searchPlaces, parseRouteQuery, KIND_LABEL, FROM_BIAS, TO_BIAS } from "./places";

// Explore's front door: one search box over every place the platform knows
// (Onction GenCos and offtakers, TCN substations, DisCos, C&I anchor loads,
// pins, and any Nigerian address). Picking anything scans it; the first
// action arms a click-to-scan crosshair on the map; "A to B" (or the route
// action) opens the route planner between two places.

const KIND_ICON = {
  action: Crosshair, route: Path, genco: Lightning, plant: Power, offtaker: Factory, substation: Plug,
  disco: Buildings, ci: Factory, pin: PushPin, address: MapPin,
};

export default function CommandPalette({ open, onOpenChange, gridParties, substations, pins, onArm, onScan, onRoute }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const q = query.trim().toLowerCase();
  const { results: addressResults, status: addressStatus } = useDebouncedAddressSearch(query, open && q.length >= 3);

  useEffect(() => { if (open) { setQuery(""); setActive(0); } }, [open]);

  const index = useMemo(() => buildPlaceIndex({ gridParties, substations, pins }), [gridParties, substations, pins]);

  const items = useMemo(() => {
    const armItem = { kind: "action", id: "arm", name: "Scan a site on the map", sub: "Click anywhere to scan it · Esc cancels" };
    const planItem = { kind: "route", id: "plan", name: "Route between two places", sub: "Pick a From and a To — or type “Dadin Kowa to Kano DisCo”" };
    if (!q) {
      // Suggest what a C&I team can actually sell: available GenCos first.
      const gencos = index.filter(i => i.kind === "genco").sort((a, b) => (a.avail !== "available") - (b.avail !== "available")).slice(0, 4);
      return [armItem, planItem, ...pins.slice(-3).map(p => index.find(i => i.kind === "pin" && i.name === p.label)).filter(Boolean), ...gencos];
    }
    // "A to B": offer the route between the best match for each side.
    const pair = parseRouteQuery(query);
    const routeItem = pair && (() => {
      const [from] = searchPlaces(index, pair.from, { limit: 1, bias: FROM_BIAS });
      const [to] = searchPlaces(index, pair.to, { limit: 1, bias: TO_BIAS });
      return from && to && from !== to
        ? { kind: "route", id: "pair", name: `${from.name} → ${to.name}`, sub: `Route · ${KIND_LABEL[from.kind]} to ${KIND_LABEL[to.kind]}`, from, to }
        : null;
    })();
    const local = searchPlaces(index, query);
    const addresses = addressResults.map(r => ({
      kind: "address", name: shortLabel(r), sub: r.display_name.split(",").slice(1, 3).join(",").trim(),
      lat: Number(r.lat), lng: Number(r.lon),
    }));
    return [
      ...(routeItem ? [routeItem] : []),
      ...("scan a site".includes(q) ? [armItem] : []),
      ...(!routeItem && ("route between".includes(q) || q.startsWith("route")) ? [planItem] : []),
      ...local, ...addresses,
    ];
  }, [q, query, index, pins, addressResults]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (item) => {
    if (!item) return;
    onOpenChange(false);
    if (item.kind === "action") onArm();
    else if (item.kind === "route") onRoute(item.from || null, item.to || null);
    else onScan(item.lat, item.lng, item.name);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
  };

  // Section headers wherever the kind changes.
  let lastKind = null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Explore</DialogPrimitive.Title>
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <MagnifyingGlass className="h-4 w-4 flex-shrink-0 text-primary" weight="bold" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a place, GenCo, substation, offtaker or address…"
              className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              aria-label="Search places to scan"
              role="combobox" aria-expanded="true" aria-controls="explore-results"
              aria-activedescendant={items[active] ? `explore-opt-${active}` : undefined}
            />
            {addressStatus === "loading" && <CircleNotch className="h-4 w-4 animate-spin text-muted-foreground" />}
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">Esc</kbd>
          </div>

          <div ref={listRef} id="explore-results" role="listbox" className="max-h-[min(60vh,440px)] overflow-y-auto p-1.5">
            {items.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                {addressStatus === "loading" ? "Searching addresses…" : `Nothing matches “${query}”.`}
              </p>
            )}
            {items.map((item, i) => {
              const Icon = KIND_ICON[item.kind];
              const isAction = item.kind === "action" || item.kind === "route";
              const group = isAction ? "actions" : item.kind;
              const header = group === lastKind ? null
                : !q ? (isAction ? "Start" : item.kind === "pin" ? "Your pins" : "Onction GenCos")
                : isAction ? "Actions" : `${KIND_LABEL[item.kind]}s`;
              lastKind = group;
              const selected = i === active;
              return (
                <div key={`${item.kind}-${item.name}-${i}`}>
                  {header && <p className="px-2.5 pb-1 pt-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{header}</p>}
                  <div
                    id={`explore-opt-${i}`} data-idx={i} role="option" aria-selected={selected}
                    onMouseMove={() => setActive(i)} onClick={() => choose(item)}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${selected ? "text-foreground" : "text-foreground/90"}`}
                    style={selected ? { background: "hsl(var(--primary) / 0.12)" } : undefined}
                  >
                    <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${isAction ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-3.5 w-3.5" weight={isAction ? "bold" : "regular"} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{item.name}</p>
                      {item.sub && <p className="truncate text-[11px] text-muted-foreground">{item.sub}</p>}
                    </div>
                    {selected && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {item.kind === "action" ? "Arm" : item.kind === "route" ? "Route" : "Scan"} <ArrowElbowDownLeft className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span><kbd className="font-mono">↑↓</kbd> move</span>
            <span><kbd className="font-mono">↵</kbd> scan</span>
            <span className="ml-auto">Type “A to B” to route between two places</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
