import { useState, useRef, useEffect, useMemo } from "react";
import { CircleNotch } from "@phosphor-icons/react";
import usePlaceSearch, { placeSubtitle } from "@/lib/usePlaceSearch";
import { searchPlaces, KIND_LABEL } from "./places";

// One end of a route (From / To): shows the chosen place; typing searches
// the same index as the command palette, plus Nigerian addresses.
export default function PlacePicker({ label, dot, value, onChange, index, placeholder, autoFocus, bias }) {
  const [text, setText] = useState(value?.name || "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const typing = open && text !== (value?.name || "");
  const { results: addressResults, status: addressStatus } = usePlaceSearch(text, typing && text.trim().length >= 3);

  useEffect(() => { setText(value?.name || ""); }, [value]);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const options = useMemo(() => {
    if (!typing || !text.trim()) return [];
    const local = searchPlaces(index, text, { perKind: 3, limit: 8, bias });
    const addresses = addressResults.slice(0, 4).map(r => ({ kind: "address", name: r.name, sub: placeSubtitle(r), lat: r.lat, lng: r.lng, state: r.state }));
    return [...local, ...addresses];
  }, [typing, text, index, addressResults, bias]);

  useEffect(() => { setActive(0); }, [text]);

  const pick = (opt) => {
    if (!opt) return;
    onChange(opt);
    setText(opt.name);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(options[active]); }
    else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); setText(value?.name || ""); }
  };

  const listId = `pick-${label.toLowerCase()}`;
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 focus-within:border-primary/70">
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-2 ring-background" style={{ background: dot }} />
        <span className="w-8 flex-shrink-0 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={(e) => { setOpen(true); e.target.select(); }}
          onBlur={() => setTimeout(() => { setOpen(false); setText(value?.name || ""); }, 120)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={`${label} place`}
          role="combobox" aria-expanded={open && options.length > 0} aria-controls={listId}
          aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
          className="h-9 min-w-0 flex-1 bg-transparent text-[12.5px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
        />
        {typing && addressStatus === "loading" && <CircleNotch className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {open && options.length > 0 && (
        <div id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-xl">
          {options.map((o, i) => (
            <div
              key={`${o.kind}-${o.name}-${i}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseMove={(e) => { if (e.movementX || e.movementY) setActive(i); }}
              className="flex cursor-pointer items-baseline gap-2 rounded px-2 py-1.5"
              style={i === active ? { background: "hsl(var(--primary) / 0.12)" } : undefined}
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{o.name}</span>
              <span className="flex-shrink-0 text-[9.5px] text-muted-foreground">{KIND_LABEL[o.kind]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
