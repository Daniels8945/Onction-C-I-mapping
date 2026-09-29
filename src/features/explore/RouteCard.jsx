import { useState } from "react";
import { motion } from "motion/react";
import * as turf from "@turf/turf";
import { Path, X, ArrowsDownUp, Copy, Check, Crosshair, Lightning, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import PlacePicker from "./PlacePicker";
import { FROM_BIAS, TO_BIAS } from "./places";
import { END_COLORS } from "./usePointRoute";
import { availabilityOf, indicativeNgnKwh, discoSupply } from "./siteScan";
import { Section, Skeleton, Problem, AVAIL_CLS, SupplyBlock, DemandBlock, SolarBlock } from "./cardParts";

const fmtKm = (km) => (km >= 100 ? Math.round(km).toLocaleString() : km.toFixed(1));
const mwh = (kwh) => Math.round(kwh / 1000).toLocaleString();

// First mile / grid / last mile as one proportional bar.
function DistanceBar({ first, grid, last }) {
  const total = first + grid + last || 1;
  const seg = [
    { km: first, color: END_COLORS.from, label: "First mile" },
    { km: grid, color: "#f5a623", label: "Grid" },
    { km: last, color: END_COLORS.to, label: "Last mile" },
  ];
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {seg.map(s => s.km > 0 && (
          <motion.div key={s.label} initial={{ width: 0 }} animate={{ width: `${Math.max(2, (100 * s.km) / total)}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }} style={{ background: s.color }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        {seg.map(s => (
          <span key={s.label} className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
            {s.label} <span className="font-mono text-foreground">{fmtKm(s.km)} km</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ value, unit, label }) {
  return (
    <div className="rounded-md bg-muted/60 px-2.5 py-2">
      <p className="font-mono text-base font-bold leading-none text-foreground">{value}<span className="ml-0.5 text-[10px] font-medium text-muted-foreground">{unit}</span></p>
      <p className="mt-1 text-[9.5px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function routeSummaryText({ from, to, route, ends, feeder, mw }) {
  const r = route.result;
  const lines = [`Onction route — ${from.name} → ${to.name}`];
  const path = r.hops?.length ? [r.hops[0].from_node, ...r.hops.map(h => h.to_node)] : [r.source_node];
  lines.push(`Grid path: ${path.join(" → ")}`);
  lines.push(`Distance: ${r.total_km} km (first mile ${r.first_mile_km} km, grid ${r.routed_km} km, last mile ${r.last_mile_km} km)`);
  lines.push(`Transmission loss: ${r.loss_pct}% (${r.loss_model?.label || "base"})`);
  const cost = indicativeNgnKwh(r.tariff_ngn_kwh, r.loss_pct);
  if (cost) lines.push(`Delivered energy cost: ~₦${cost.toFixed(1)}/kWh (GenCo tariff ₦${r.tariff_ngn_kwh} + losses; wheeling not included)`);
  if (r.projection) lines.push(`At ${mw} MW for a month: ${mwh(r.projection.contracted_kwh)} MWh sent, ${mwh(r.projection.delivered_kwh)} MWh delivered, ${mwh(r.projection.transmission_loss_kwh)} MWh lost`);
  for (const [tag, end] of [["A", ends.from], ["B", ends.to]]) {
    if (end?.supply?.status === "ready") discoSupply(end.supply.discoIds, feeder.data).forEach(d =>
      lines.push(`${tag} · ${d.id}: ${d.online}/${d.feeders} feeders on, ~${d.availabilityPct}% availability today`));
  }
  return lines.join("\n");
}

export default function RouteCard({ planner, index, feeder, onClose, onScan }) {
  const [copied, setCopied] = useState(false);
  const { from, to, mw, route, ends } = planner;
  const r = route.status === "ready" ? route.result : null;
  const path = r ? (r.hops?.length ? [r.hops[0].from_node, ...r.hops.map(h => h.to_node)] : [r.source_node]) : [];
  const straightKm = from && to ? turf.distance([from.lng, from.lat], [to.lng, to.lat], { units: "kilometers" }) : null;
  const isGenco = r?.source_kind === "genco";
  const avail = isGenco ? availabilityOf(r.commitment) : null;
  const cost = r ? indicativeNgnKwh(r.tariff_ngn_kwh, r.loss_pct) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(routeSummaryText({ from, to, route, ends, feeder, mw }));
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked */ }
  };

  return (
    <motion.aside
      data-testid="route-card"
      initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute left-3 right-3 bottom-3 top-auto z-[26] flex max-h-[62%] flex-col overflow-hidden rounded-xl border border-border shadow-2xl backdrop-blur-md
                 sm:right-auto sm:bottom-auto sm:top-3 sm:w-[360px] sm:max-h-[calc(100%-5.5rem)]"
      style={{ background: "color-mix(in srgb, hsl(var(--card)) 94%, transparent)" }}
      aria-label="Route between two places"
    >
      {/* Header: From / To */}
      <div className="relative px-4 pb-3 pt-3.5">
        <div className="pointer-events-none absolute inset-0 opacity-60"
             style={{ background: "radial-gradient(120% 90% at 0% 0%, hsl(var(--primary) / 0.18), transparent 60%)" }} />
        <div className="relative mb-2.5 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary"><Path className="h-4 w-4" weight="bold" /></div>
          <p className="flex-1 text-[9px] font-bold uppercase tracking-[0.2em] text-primary">Route</p>
          <button onClick={onClose} aria-label="Close route" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative flex items-stretch gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <PlacePicker label="From" dot={END_COLORS.from} value={from} onChange={planner.setFrom} index={index} bias={FROM_BIAS}
                         placeholder="GenCo, plant, substation, address…" autoFocus={!from} />
            <PlacePicker label="To" dot={END_COLORS.to} value={to} onChange={planner.setTo} index={index} bias={TO_BIAS}
                         placeholder="DisCo, offtaker, C&I site, address…" autoFocus={!!from && !to} />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={planner.swap} disabled={!from && !to} aria-label="Swap From and To"
                      className="flex w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40">
                <ArrowsDownUp className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Swap</TooltipContent>
          </Tooltip>
        </div>
        <label className="relative mt-2 flex items-center gap-2 text-[10.5px] text-muted-foreground">
          Load
          <input
            type="number" min="0" step="0.5" inputMode="decimal" value={mw} onChange={(e) => planner.setMw(e.target.value)}
            placeholder="e.g. 10" aria-label="Load in MW"
            className="h-7 w-20 rounded border border-border bg-background/60 px-2 font-mono text-[11.5px] text-foreground outline-none focus:border-primary/70"
          />
          MW — shows monthly energy delivered and lost
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {(!from || !to) && (
          <p className="border-t border-border px-4 py-5 text-[11.5px] leading-relaxed text-muted-foreground">
            Pick where the power comes from and where it goes. Any place works: an Onction GenCo routes from its own grid connection; anything else joins the grid at its nearest built substation.
          </p>
        )}

        {from && to && (
          <Section icon={Path} title="Grid route" source={r ? "live" : null}>
            {route.status === "loading" && <Skeleton lines={4} />}
            {route.status === "error" && <Problem>{route.message}</Problem>}
            {r && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={fmtKm(r.total_km)} unit="km" label="Total distance" />
                  <Stat value={r.loss_pct} unit="%" label="Grid loss" />
                  <Stat value={r.hop_count} unit="" label={r.hop_count === 1 ? "Grid hop" : "Grid hops"} />
                </div>
                <DistanceBar first={r.first_mile_km || 0} grid={r.routed_km} last={r.last_mile_km || 0} />
                <div className="flex flex-wrap items-center gap-y-1 text-[10.5px]">
                  {path.map((n, i) => (
                    <span key={`${n}-${i}`} className="flex items-center">
                      {i > 0 && <CaretRight className="mx-0.5 h-2.5 w-2.5 text-muted-foreground" />}
                      <span className={`rounded px-1.5 py-0.5 ${i === 0 || i === path.length - 1 ? "bg-primary/15 font-semibold text-foreground" : "bg-muted text-foreground/85"}`}>{n}</span>
                    </span>
                  ))}
                </div>
                {straightKm != null && straightKm > 1 && (
                  <p className="text-[10px] text-muted-foreground">
                    Straight line {fmtKm(straightKm)} km · the grid path is <span className="text-foreground">{(r.total_km / straightKm).toFixed(1)}×</span> longer.
                  </p>
                )}
                {r.projection && (
                  <div className="rounded-md border border-border px-2.5 py-2 text-[10.5px] text-muted-foreground">
                    At <span className="font-mono text-foreground">{mw} MW</span> for a month:{" "}
                    <span className="font-mono text-foreground">{mwh(r.projection.contracted_kwh)}</span> MWh sent,{" "}
                    <span className="font-mono text-emerald-500">{mwh(r.projection.delivered_kwh)}</span> MWh delivered,{" "}
                    <span className="font-mono text-red-400">{mwh(r.projection.transmission_loss_kwh)}</span> MWh lost to the grid.
                  </div>
                )}
                <p className="text-[9.5px] leading-snug text-muted-foreground/80">
                  Loss applies to the grid section ({r.loss_model?.label || "base loading"}). First/last-mile losses and TCN/DisCo wheeling charges are not modelled yet.
                </p>
              </div>
            )}
          </Section>
        )}

        {/* A: where power comes from */}
        {from && (
          <Section icon={Lightning} title={`A · ${from.name}`} source={isGenco ? "live" : null} delay={0.04}>
            {isGenco ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full border px-1.5 text-[8.5px] font-semibold ${AVAIL_CLS[avail.key]}`}>{avail.label}</span>
                  {r.capacity_note && <span className="truncate text-[10.5px] text-muted-foreground">{r.capacity_note}</span>}
                </div>
                {r.tariff_ngn_kwh != null && (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Tariff ₦{r.tariff_ngn_kwh}/kWh{cost != null && <> · delivered <span className="text-foreground">₦{cost.toFixed(1)}/kWh</span></>}
                  </p>
                )}
              </div>
            ) : r ? (
              <p className="text-[11.5px] text-muted-foreground">
                Not an Onction GenCo — joins the grid at <span className="font-semibold text-foreground">{r.source_node}</span>, {r.first_mile_km} km away. No tariff on record.
              </p>
            ) : route.status === "loading" ? <Skeleton lines={1} /> : null}
          </Section>
        )}
        {ends.from && <SupplyBlock supply={ends.from.supply} feeder={feeder} title="DisCo supply at A" delay={0.06} />}

        {/* B: where power goes */}
        {ends.to && (
          <>
            <SupplyBlock supply={ends.to.supply} feeder={feeder} title="DisCo supply at B" delay={0.08} />
            <DemandBlock demand={ends.to.demand} delay={0.1} />
            <SolarBlock solar={ends.to.solar} delay={0.12} />
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-t border-border px-3 py-2.5">
        <Button size="sm" variant="secondary" className="flex-1" disabled={!to} onClick={() => onScan(to)}>
          <Crosshair className="h-3.5 w-3.5" /> Scan destination
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="secondary" className="h-8 w-8" onClick={copy} disabled={!r} aria-label="Copy route summary">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied" : "Copy summary"}</TooltipContent>
        </Tooltip>
      </div>
    </motion.aside>
  );
}
