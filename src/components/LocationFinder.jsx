// components/LocationFinder.jsx
import { useState } from "react";

const inputCls = `w-full bg-surface border border-rim rounded-[5px] text-light
  font-mono text-[11px] px-2.5 py-[7px] outline-none
  focus:border-accent transition-colors duration-150 placeholder:text-slate/50`;

const GoBtn = ({ onClick, children, slim = false, variant = "outline" }) => (
  <button
    onClick={onClick}
    className={`border rounded-[5px] font-mono text-[10px] uppercase tracking-widest
      font-semibold cursor-pointer transition-all duration-150
      ${slim ? "w-9 flex items-center justify-center py-[7px]" : "w-full py-[7px]"}
      ${variant === "solid"
        ? "border-accent bg-accent text-surface hover:bg-accent/80"
        : "border-accent text-accent hover:bg-accent hover:text-surface"
      }`}
  >
    {children}
  </button>
);

export default function LocationFinder({ onAddPin }) {
  const [tab,     setTab]     = useState("coords");
  const [lat,     setLat]     = useState("");
  const [lng,     setLng]     = useState("");
  const [label,   setLabel]   = useState("");
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  function goCoords() {
    const la = parseFloat(lat), lo = parseFloat(lng);
    if (isNaN(la) || isNaN(lo))  return setError("Enter valid numbers.");
    if (la < -90 || la > 90)     return setError("Latitude must be −90 to 90.");
    if (lo < -180 || lo > 180)   return setError("Longitude must be −180 to 180.");
    setError("");
    const pinLabel = label.trim() || `${la.toFixed(4)}°N, ${lo.toFixed(4)}°E`;
    onAddPin(lo, la, pinLabel);
    setLat(""); setLng(""); setLabel("");
  }

  async function searchAddress() {
    if (!query.trim()) return;
    setLoading(true); setResults([]); setError("");
    try {
      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=ng`;
      const data = await fetch(url, { headers: { "Accept-Language": "en" } }).then(r => r.json());
      if (!data.length) setError("No results found in Nigeria.");
      setResults(data);
    } catch {
      setError("Geocoding unavailable — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function pickResult(r) {
    const pinLabel = r.display_name.split(",")[0];
    onAddPin(parseFloat(r.lon), parseFloat(r.lat), pinLabel);
    setQuery(pinLabel);
    setResults([]);
  }

  const TabBtn = ({ id, children }) => (
    <button
      onClick={() => { setTab(id); setError(""); setResults([]); }}
      className={`flex-1 py-[5px] text-[10px] uppercase tracking-[0.1em] rounded cursor-pointer
        font-mono transition-all duration-150 border-none
        ${tab === id ? "bg-rim text-accent" : "bg-transparent text-slate hover:text-light"}`}
    >
      {children}
    </button>
  );

  return (
    <div className="mx-3 bg-elevated border border-rim rounded-lg overflow-hidden">
      <div className="px-2.5 py-[7px] bg-surface border-b border-rim text-[9px]
        tracking-[0.14em] uppercase text-slate flex items-center gap-1.5">
        📍 Pin a Location
      </div>

      <div className="p-2.5">
        {/* Tabs */}
        <div className="flex gap-1 bg-surface border border-rim rounded-md p-[3px] mb-2.5">
          <TabBtn id="coords">Coordinates</TabBtn>
          <TabBtn id="address">Address</TabBtn>
        </div>

        {/* ── Coordinates tab ── */}
        {tab === "coords" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[9px] text-slate mb-1 tracking-[0.1em] uppercase">Latitude</p>
                <input className={inputCls} placeholder="e.g. 9.0765"
                  value={lat} onChange={e => setLat(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && goCoords()} />
              </div>
              <div>
                <p className="text-[9px] text-slate mb-1 tracking-[0.1em] uppercase">Longitude</p>
                <input className={inputCls} placeholder="e.g. 7.3986"
                  value={lng} onChange={e => setLng(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && goCoords()} />
              </div>
            </div>
            <div>
              <p className="text-[9px] text-slate mb-1 tracking-[0.1em] uppercase">
                Pin Label <span className="normal-case">(optional)</span>
              </p>
              <input className={inputCls} placeholder="e.g. Proposed factory site"
                value={label} onChange={e => setLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && goCoords()} />
            </div>
            <GoBtn onClick={goCoords} variant="solid">+ Add Pin</GoBtn>
          </div>
        )}

        {/* ── Address tab ── */}
        {tab === "address" && (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              <input className={`${inputCls} flex-1`}
                placeholder="Search address in Nigeria…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && searchAddress()} />
              <GoBtn slim onClick={searchAddress}>{loading ? "…" : "⌕"}</GoBtn>
            </div>
            {results.length > 0 && (
              <div className="border border-rim rounded-md overflow-hidden">
                {results.map(r => (
                  <div key={r.place_id} onClick={() => pickResult(r)}
                    className="px-2 py-2 cursor-pointer border-b border-rim last:border-0
                      hover:bg-rim transition-colors duration-100">
                    <p className="text-[10px] font-semibold text-accent leading-tight">
                      {r.display_name.split(",")[0]}
                    </p>
                    <p className="text-[9px] text-slate leading-tight mt-0.5">
                      {r.display_name.split(",").slice(1, 3).join(",")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-[10px] text-danger mt-1.5">{error}</p>}
      </div>
    </div>
  );
}

