import { useState, useMemo, useEffect, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  MagnifyingGlass, Crosshair, Lightning, Buildings, Factory, Plug, MapPin, PushPin, CircleNotch, ArrowElbowDownLeft,
} from "@phosphor-icons/react";
import { useDebouncedAddressSearch, shortLabel } from "@/components/LocationFinder";
import { CI_CUSTOMERS, DISCOS } from "@/data";
import { availabilityOf } from "./siteScan";

// Explore's front door: one search box over every place the platform knows
// (Onction GenCos and offtakers, TCN substations, DisCos, C&I anchor loads,
// pins, and any Nigerian address). Picking anything scans it; the first
// action arms a click-to-scan crosshair on the map.

const KIND_META = {
  action:     { icon: Crosshair,   label: "Action" },
  genco:      { icon: Lightning,   label: "Onction GenCo" },
  offtaker:   { icon: Factory,     label: "Onction offtaker" },
  substation: { icon: Plug,        label: "TCN substation" },
  disco:      { icon: Buildings,   label: "DisCo HQ" },
  ci:         { icon: Factory,     label: "C&I anchor load" },
  pin:        { icon: PushPin,     label: "Your pin" },
  address:    { icon: MapPin,      label: "Address" },
};
const MAX_PER_GROUP = 5;

function buildIndex({ gridParties, substations, pins }) {
  return [
    ...gridParties.gencos.filter(g => g.lat != null).map(g => {
      const avail = availabilityOf(g.commitment);
      return { kind: "genco", name: g.name, sub: [avail.label, g.capacity_note].filter(Boolean).join(" · "), avail: avail.key, lat: g.lat, lng: g.lon };
    }),
    ...gridParties.offtakers.filter(o => o.lat != null).map(o => ({ kind: "offtaker", name: o.name, sub: [o.location, o.capacity_mw && `${o.capacity_mw} MW`].filter(Boolean).join(" · "), lat: o.lat, lng: o.lon })),
    ...substations.map(s => ({ kind: "substation", name: s.name, sub: `${s.voltage_kv} kV · ${s.status}`, lat: s.lat, lng: s.lon })),
    ...DISCOS.map(d => ({ kind: "disco", name: d.id, sub: d.name, lat: d.lat, lng: d.lng })),
    ...CI_CUSTOMERS.map(c => ({ kind: "ci", name: c.name, sub: [c.sector, c.state].filter(Boolean).join(" · "), lat: c.lat, lng: c.lng })),
    ...pins.map(p => ({ kind: "pin", name: p.label, sub: `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`, lat: p.lat, lng: p.lng })),
  ];
}

function score(item, q) {
  const n = item.name.toLowerCase(), s = (item.sub || "").toLowerCase();
  if (n.startsWith(q)) return 3;
  if (n.split(/[\s(—-]+/).some(w => w.startsWith(q))) return 2;
  if (n.includes(q)) return 1.5;
  if (s.includes(q)) return 1;
  return 0;
}

export default function CommandPalette({ open, onOpenChange, gridParties, substations, pins, onArm, onScan }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const q = query.trim().toLowerCase();
  const { results: addressResults, status: addressStatus } = useDebouncedAddressSearch(query, open && q.length >= 3);

  useEffect(() => { if (open) { setQuery(""); setActive(0); } }, [open]);

  const index = useMemo(() => buildIndex({ gridParties, substations, pins }), [gridParties, substations, pins]);

  const items = useMemo(() => {
    const armItem = { kind: "action", id: "arm", name: "Scan a site on the map", sub: "Click anywhere to scan it · Esc cancels" };
    if (!q) {
      // Suggest what a C&I team can actually sell: available GenCos first.
      const gencos = index.filter(i => i.kind === "genco").sort((a, b) => (a.avail !== "available") - (b.avail !== "available")).slice(0, 4);
      return [armItem, ...pins.slice(-3).map(p => index.find(i => i.kind === "pin" && i.name === p.label)).filter(Boolean), ...gencos];
    }
    const matched = index.map(i => ({ ...i, s: score(i, q) })).filter(i => i.s > 0).sort((a, b) => b.s - a.s);
    const perKind = {};
    const local = matched.filter(i => (perKind[i.kind] = (perKind[i.kind] || 0) + 1) <= MAX_PER_GROUP);
    const addresses = addressResults.map(r => ({
      kind: "address", name: shortLabel(r), sub: r.display_name.split(",").slice(1, 3).join(",").trim(),
      lat: Number(r.lat), lng: Number(r.lon),
    }));
    return [...("scan a site".includes(q) ? [armItem] : []), ...local, ...addresses];
  }, [q, index, pins, addressResults]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (item) => {
    if (!item) return;
    onOpenChange(false);
    if (item.kind === "action") onArm();
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
              const meta = KIND_META[item.kind];
              const Icon = meta.icon;
              const header = !q
                ? (i === 0 ? "Start" : item.kind !== lastKind ? (item.kind === "pin" ? "Your pins" : "Onction GenCos") : null)
                : item.kind !== lastKind ? (item.kind === "action" ? "Actions" : `${meta.label}s`) : null;
              lastKind = item.kind;
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
                    <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${item.kind === "action" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-3.5 w-3.5" weight={item.kind === "action" ? "bold" : "regular"} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{item.name}</p>
                      {item.sub && <p className="truncate text-[11px] text-muted-foreground">{item.sub}</p>}
                    </div>
                    {selected && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {item.kind === "action" ? "Arm" : "Scan"} <ArrowElbowDownLeft className="h-3 w-3" />
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
            <span className="ml-auto">Every result opens a site scan</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
