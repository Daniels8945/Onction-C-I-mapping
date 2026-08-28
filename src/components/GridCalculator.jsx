import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Path, Broadcast, X, CircleNotch, Warning, PencilSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

function Row({ k, v }) {
  return (
    <div className="flex justify-between text-[10px] py-1 border-t border-border gap-2">
      <span className="text-muted-foreground flex-shrink-0">{k}</span>
      <span className="text-foreground text-right break-words max-w-[150px]">{v}</span>
    </div>
  );
}

// The map draws this as a line; this renders the same path as plain text —
// every point the power actually passes through, in order — and doubles as an
// admin override: edit the chain and Apply to reroute the map to exactly what's typed.
function chainFromResult(result) {
  if (!result) return "";
  const middle = result.hops?.length
    ? [result.hops[0].from_node, ...result.hops.map(h => h.to_node)]
    : [result.injection_node];
  const chain = [result.genco, ...middle, result.destination].filter(Boolean);
  // A custom route's first hop can start exactly at the source itself (no separate
  // connection substation was named) — collapse that immediate repeat, if any.
  return chain.filter((name, i) => i === 0 || name !== chain[i - 1]).join(" → ");
}

function RouteText({ result, lossModel, scenario, onApply }) {
  const computedChain = chainFromResult(result);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(computedChain);
  useEffect(() => { setText(computedChain); setEditing(false); }, [computedChain]);

  if (!result) return null;

  if (!editing) {
    return (
      <div className="mt-1.5 pt-1.5 border-t border-border flex items-start justify-between gap-2">
        <p className="text-[9px] text-muted-foreground break-words leading-relaxed flex-1">
          {computedChain}{result.isCustom && <span className="ml-1 text-accent">(custom)</span>}
        </p>
        {onApply && (
          <button onClick={() => setEditing(true)} title="Edit route" className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors">
            <PencilSimple className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1.5 pt-1.5 border-t border-border space-y-1.5">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-[9px] leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
      />
      <p className="text-[8px] text-muted-foreground leading-relaxed">
        Edit the chain (separated by →), then Apply to reroute the map. Distances become straight-line estimates between the points you list, not real corridor lengths.
      </p>
      <div className="flex gap-1.5">
        <Button size="sm" className="flex-1 h-6 text-[10px]" onClick={() => { onApply(text, { lossModel, scenario: scenario === "__none" ? undefined : scenario }); setEditing(false); }}>Apply</Button>
        <Button size="sm" variant="secondary" className="flex-1 h-6 text-[10px]" onClick={() => { setText(computedChain); setEditing(false); }}>Cancel</Button>
      </div>
    </div>
  );
}

export default function GridCalculator({
  gridStatus, gridError, gridParties, gridLossModels, gridAtccScenarios,
  gridRouteResult, gridBestSource, presetGenco, presetDest, pins = [], onComputeRoute, onComputeBestSource, onClear, onApplyCustomRoute,
}) {
  const { gencos = [], discos = [], offtakers = [] } = gridParties;
  // Pinned locations aren't in the PPA dataset — they have no fixed injection_node,
  // so routing them goes through lat/lng and the backend's nearest-substation lookup
  // instead of a stored name (see the "pin:" value branch in run() below).
  const destinations = [
    ...pins.map(p => ({ value: `pin:${p.id}`, name: p.label || "Pinned location", kind: "Pin" })),
    ...offtakers.map(o => ({ value: o.name, name: o.name, kind: "Offtaker" })),
    ...discos.map(d => ({ value: d.name, name: d.name, kind: "DisCo" })),
  ];

  const [genco, setGenco] = useState("");
  const [dest,  setDest]  = useState("");
  const [destMw, setDestMw] = useState("");
  const [lossModel, setLossModel] = useState("base");
  const [scenario,  setScenario]  = useState("__none");

  // Clicking a marker on the map loads it straight into the calculator.
  useEffect(() => { if (presetGenco) setGenco(presetGenco); }, [presetGenco]);
  useEffect(() => { if (presetDest)  setDest(presetDest);   }, [presetDest]);

  const selectedPin = dest.startsWith("pin:") ? pins.find(p => `pin:${p.id}` === dest) : null;

  if (gridStatus === "loading") {
    return (
      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-2">
        <CircleNotch className="h-3 w-3 animate-spin" /> Loading grid atlas…
      </p>
    );
  }
  if (gridStatus === "error") {
    return (
      <Card className="border-destructive/40">
        <CardContent className="pt-3 text-[10px] text-destructive flex gap-2">
          <Warning className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>Grid API unavailable.<br /><span className="text-muted-foreground">{gridError || "Is the server running on :4000?"}</span></span>
        </CardContent>
      </Card>
    );
  }

  const run = (mode) => {
    if (!dest) return;
    const scenarioArg = scenario === "__none" ? undefined : scenario;
    const mwArg = destMw !== "" ? Number(destMw) : undefined;
    // A pinned location has no PPA-assigned injection_node — route it by
    // coordinates so the backend can find its actual nearest TCN substation.
    const target = selectedPin
      ? { lat: selectedPin.lat, lng: selectedPin.lng, label: selectedPin.label || "Pinned location", mw: mwArg }
      : { dest, mw: mwArg };
    if (mode === "route") {
      if (!genco) return;
      onComputeRoute({ genco, lossModel, scenario: scenarioArg, ...target });
    } else {
      onComputeBestSource({ lossModel, scenario: scenarioArg, ...target });
    }
  };

  const result = gridRouteResult;
  const best = gridBestSource;

  return (
    <div className="space-y-1.5 pb-1">
      <Select value={genco} onValueChange={setGenco}>
        <SelectTrigger><SelectValue placeholder="Source GenCo…" /></SelectTrigger>
        <SelectContent>
          {gencos.map(g => <SelectItem key={g.name} value={g.name}>{g.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={dest} onValueChange={setDest}>
        <SelectTrigger><SelectValue placeholder="Destination…" /></SelectTrigger>
        <SelectContent>
          {destinations.map(d => <SelectItem key={d.value} value={d.value}>{d.kind === "Pin" ? "📍 " : ""}{d.name} ({d.kind})</SelectItem>)}
        </SelectContent>
      </Select>

      {selectedPin && (
        <input
          type="number"
          min="0"
          step="0.1"
          placeholder="Capacity (MW) — optional, for loss estimate"
          value={destMw}
          onChange={e => setDestMw(e.target.value)}
          className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-[11px] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      )}

      <div className="flex gap-1.5">
        <Select value={lossModel} onValueChange={setLossModel}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {gridLossModels.map(l => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={scenario} onValueChange={setScenario}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No AT&C&C</SelectItem>
            {gridAtccScenarios.map(a => <SelectItem key={a.code} value={a.code}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-1.5">
        <Button size="sm" className="flex-1" disabled={!genco || !dest} onClick={() => run("route")}>
          <Path className="h-3.5 w-3.5" /> Route
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" disabled={!dest} onClick={() => run("best")}>
          <Broadcast className="h-3.5 w-3.5" /> Nearest Source
        </Button>
        {(result || best) && (
          <Button size="icon" variant="ghost" onClick={onClear} title="Clear">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {result && !result.error && (
          <motion.div key="route-result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <Card>
              <CardContent className="pt-3">
                <p className="text-xs font-bold text-primary truncate">{result.genco} → {result.destination}</p>
                <p className="text-[9px] text-muted-foreground mb-1">via {result.injection_node} · {result.hop_count} hops</p>
                <Row k="Routed" v={`${result.routed_km} km`} />
                <Row k="Last mile" v={`${result.last_mile_km} km`} />
                <Row k="Total" v={`${result.total_km} km`} />
                <Row k="Loss" v={`${result.loss_pct}% (${result.loss_model.label})`} />
                {result.commitment != null && <Row k="Commitment" v={result.commitment} />}
                {result.tariff_ngn_kwh != null && <Row k="Tariff" v={`₦${result.tariff_ngn_kwh}/kWh`} />}
                {result.projection && (
                  <>
                    <Row k="Delivered/mo" v={`${(result.projection.delivered_kwh / 1000).toFixed(0)} MWh`} />
                    {result.projection.recovered_kwh != null && <Row k="Recovered/mo" v={`${(result.projection.recovered_kwh / 1000).toFixed(0)} MWh`} />}
                  </>
                )}
                <RouteText result={result} lossModel={lossModel} scenario={scenario} onApply={onApplyCustomRoute} />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      {result?.error && <p className="text-[10px] text-destructive">{result.error}</p>}

      <AnimatePresence mode="wait">
        {best && !best.error && (
          <motion.div key="best-source" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <Card>
              <CardContent className="pt-3 space-y-1">
                <p className="text-xs font-bold text-primary">Nearest source → {best.destination}</p>
                {best.results.map((r, i) => (
                  <div key={r.genco} className={`flex justify-between text-[10px] py-0.5 ${i === 0 ? "text-primary" : "text-foreground/90"} border-t border-border`}>
                    <span className="truncate">{i + 1}. {r.genco}</span>
                    <span>{r.total_km} km · {r.loss_pct}%</span>
                  </div>
                ))}
                <RouteText result={best.results[0]} lossModel={lossModel} scenario={scenario} onApply={onApplyCustomRoute} />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      {best?.error && <p className="text-[10px] text-destructive">{best.error}</p>}
    </div>
  );
}
