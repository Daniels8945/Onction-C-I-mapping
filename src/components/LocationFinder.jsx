import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, MagnifyingGlass, CircleNotch, MapPinLine } from "@phosphor-icons/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Biases (not restricts — bounded=0) Nominatim toward Nigeria's bounding box,
// on top of the countrycodes filter, so ambiguous names ("Victoria Island" vs
// a same-named place elsewhere) rank correctly.
const NG_VIEWBOX = "2.6,13.9,14.7,4.2";

function useDebouncedAddressSearch(query, enabled) {
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error

  useEffect(() => {
    if (!enabled || query.trim().length < 3) { setResults([]); setStatus("idle"); return; }
    setStatus("loading");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=ng&format=json&limit=6&addressdetails=1&viewbox=${NG_VIEWBOX}&bounded=0`;
        const r = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        const d = await r.json();
        setResults(d);
        setStatus("done");
      } catch (err) {
        if (err.name !== "AbortError") setStatus("error");
      }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, enabled]);

  return { results, status };
}

function shortLabel(result) {
  const a = result.address || {};
  return a.amenity || a.shop || a.office || a.building || a.road || result.display_name.split(",")[0];
}

export default function LocationFinder({ onAddPin }) {
  const [tab,   setTab]   = useState("coords");
  const [label, setLabel] = useState("");
  const [lat,   setLat]   = useState("");
  const [lng,   setLng]   = useState("");
  const [query, setQuery] = useState("");
  const [coordsStatus, setCoordsStatus] = useState("");
  const boxRef = useRef(null);

  const { results, status: searchStatus } = useDebouncedAddressSearch(query, tab === "address");
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(tab === "address" && query.trim().length >= 3); }, [tab, query]);

  // Close the results dropdown on outside click
  useEffect(() => {
    function onDocClick(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pickResult = (r) => {
    onAddPin(parseFloat(r.lon), parseFloat(r.lat), label.trim() || shortLabel(r));
    setQuery(""); setLabel(""); setOpen(false);
  };

  const submitCoords = () => {
    const la = parseFloat(lat), ln = parseFloat(lng);
    if (isNaN(la) || isNaN(ln)) { setCoordsStatus("Enter valid lat/lng"); return; }
    onAddPin(ln, la, label.trim() || "Pin"); setCoordsStatus(""); setLat(""); setLng(""); setLabel("");
  };

  return (
    <div className="p-2.5 space-y-2">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="coords" className="flex-1">Coordinates</TabsTrigger>
          <TabsTrigger value="address" className="flex-1">Address</TabsTrigger>
        </TabsList>
      </Tabs>
      <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)" />

      {tab === "coords" ? (
        <>
          <div className="flex gap-1.5">
            <Input value={lat} onChange={e => setLat(e.target.value)} placeholder="Latitude" />
            <Input value={lng} onChange={e => setLng(e.target.value)} placeholder="Longitude" />
          </div>
          <Button onClick={submitCoords} className="w-full">
            <Plus className="h-3.5 w-3.5" /> Add Pin
          </Button>
          {coordsStatus && <p className="text-[9px] text-muted-foreground">{coordsStatus}</p>}
        </>
      ) : (
        <div ref={boxRef} className="relative">
          <div className="relative">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => query.trim().length >= 3 && setOpen(true)}
              placeholder="Search an address in Nigeria…"
              className="pl-8"
            />
            {searchStatus === "loading" && (
              <CircleNotch className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
            )}
          </div>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
              >
                {searchStatus === "loading" && results.length === 0 && (
                  <p className="px-3 py-2.5 text-[10px] text-muted-foreground">Searching…</p>
                )}
                {searchStatus === "error" && (
                  <p className="px-3 py-2.5 text-[10px] text-destructive">Search failed — check your connection.</p>
                )}
                {searchStatus === "done" && results.length === 0 && (
                  <p className="px-3 py-2.5 text-[10px] text-muted-foreground">No matches in Nigeria for “{query}”.</p>
                )}
                {results.map((r) => (
                  <button
                    key={r.place_id}
                    onClick={() => pickResult(r)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent/70 transition-colors border-b border-border last:border-b-0"
                  >
                    <MapPinLine className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-xs text-foreground truncate">{shortLabel(r)}</span>
                      <span className="block text-[9px] text-muted-foreground truncate">{r.display_name}</span>
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-[9px] text-muted-foreground mt-1.5">
            {results.length > 0 ? `${results.length} match${results.length > 1 ? "es" : ""} — pick the exact one.` : "Type at least 3 characters to search."}
          </p>
        </div>
      )}
    </div>
  );
}
