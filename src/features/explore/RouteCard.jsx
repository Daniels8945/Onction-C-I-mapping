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
import { Section, Skeleton, Problem, AVAIL_CLS, SupplyBlock, DemandBlock, SolarBlock, lossBreakdown, Term } from "./cardParts";
import { MODEL_DATA_NOTE } from "@/data/provenance";

const fmtKm = (km) => (km >= 100 ? Math.round(km).toLocaleString() : km.toFixed(1));
const mwh = (kwh) => Math.round(kwh / 1000).toLocaleString();

// How a first/last mile was measured: road distance when OSRM resolved it,
// otherwise straight-line to the supply point. Neither is an existing line.
const mileHow = (km, geometry) => (km > 0 ? (geometry ? "by road" : "straight line") : null);

// First mile / grid / last mile as one proportional bar.
function DistanceBar({ first, grid, last, firstHow, lastHow }) {
  const total = first + grid + last || 1;
  const seg = [
    { km: first, color: END_COLORS.from, label: "First mile", term: "first mile", how: firstHow },
    { km: grid, color: "#f5a623", label: "Grid", term: "grid section", how: "along modelled lines" },
    { km: last, color: END_COLORS.to, label: "Last mile", term: "last mile", how: lastHow },
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
            <Term term={s.term}>{s.label}</Term> <span className="font-mono text-foreground">{fmtKm(s.km)} km</span>
            {s.how && s.km > 0 && <span className="text-muted-foreground/70">({s.how})</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// Where one end of the route joins the grid, and a choice of other nearby
// substations (only for ends that are points, not named Onction parties).
function JoinPicker({ end, label, node, join, onChange }) {
  if (!join) return null;
  return (
    <div className="space-y-1" data-testid={`join-${end}`}>
      <label className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ background: END_COLORS[end] }} />
        {label} joins the grid at
        <select value={join.choice === "manual" ? node : ""} onChange={(e) => onChange(end, e.target.value || null)}
                aria-label={`${label}: substation to join the grid at`}
                className="h-6 max-w-[11rem] rounded border border-border bg-background/60 px-1 text-[11px] font-semibold text-foreground outline-none focus:border-primary/70">
          <option value="">{join.choice === "auto" ? `${node} (nearest listed)` : "Nearest listed supply point"}</option>
          {join.options.filter(o => !(join.choice === "auto" && o.name === node)).map(o => (
            <option key={o.name} value={o.name}>{o.name} · {o.km} km{o.supply_point ? "" : " · unconfirmed"}</option>
          ))}
        </select>
      </label>
      {!join.confirmed && (
        <Problem>{node} isn't confirmed as a supply point in Onction's data. The figures assume it could be used.</Problem>
      )}
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
  const first = mileHow(r.first_mile_km, r.first_mile_geometry), last = mileHow(r.last_mile_km, r.last_mile_geometry);
  lines.push(`Distance: ${r.total_km} km (first mile ${r.first_mile_km} km${first ? `, ${first}` : ""}; grid ${r.routed_km} km; last mile ${r.last_mile_km} km${last ? `, ${last}` : ""})`);
  lines.push(`Grid loss (screening estimate, grid section only): ${lossBreakdown(r) || `${r.loss_pct}%`}`);
  const cost = indicativeNgnKwh(r.tariff_ngn_kwh, r.loss_pct);
  if (cost) lines.push(`Delivered energy cost: ~₦${cost.toFixed(1)}/kWh (GenCo tariff ₦${r.tariff_ngn_kwh} + grid losses; first/last-mile losses and wheeling not included)`);
  lines.push(`Model data: ${MODEL_DATA_NOTE}`);
  if (r.projection) lines.push(`At ${mw} MW for a month: ${mwh(r.projection.contracted_kwh)} MWh sent, ${mwh(r.projection.delivered_kwh)} MWh delivered, ${mwh(r.projection.transmission_loss_kwh)} MWh lost`);
  for (const [tag, end] of [["A", ends.from], ["B", ends.to]]) {
    if (end?.supply?.status === "ready") discoSupply(end.supply.discoIds, feeder.data).forEach(d =>
      lines.push(`${tag} · ${d.id}: ${d.online}/${d.feeders} feeders on, ~${d.availabilityPct}% availability today`));
  }
  return lines.join("\n");
}

// 3D view of the route: on/off, what's drawn, and what the towers mean.
function View3D({ v }) {
  if (!v) return null;
  const chip = (k, label) => (
    <button key={k} type="button" onClick={() => v.toggleLayer(k)} aria-pressed={v.view[k]} data-testid={`route3d-${k}`} disabled={!v.threeD}
            className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium disabled:opacity-40 ${v.view[k] ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground line-through"}`}>
      {label}
    </button>
  );
  return (
    <div className="space-y-1.5 rounded-md border border-border px-2.5 py-2" data-testid="route-3d">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={v.toggle3D} aria-pressed={v.threeD} data-testid="route3d-toggle"
                className={`mr-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold ${v.threeD ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          3D {v.threeD ? "on" : "off"}
        </button>
        {chip("towers", "Towers")}{chip("substations", "Substations")}{chip("flow", "Energy flow")}
        <span className="ml-auto flex items-center gap-0.5 text-[10px]">
          <button type="button" onClick={() => v.allLayers(true)} disabled={!v.threeD} data-testid="route3d-all-on" className="rounded px-1 font-semibold text-foreground hover:bg-accent disabled:opacity-40">All on</button>
          <span className="text-border">|</span>
          <button type="button" onClick={() => v.allLayers(false)} disabled={!v.threeD} data-testid="route3d-all-off" className="rounded px-1 font-semibold text-foreground hover:bg-accent disabled:opacity-40">All off</button>
        </span>
        {v.status === "loading" && <span className="text-[10px] text-muted-foreground">Loading…</span>}
      </div>
      {v.status === "error" && <Problem>The 3D view couldn't load on this device. The route and its numbers are unaffected.</Problem>}
      {v.threeD && (
        <p className="text-[9.5px] leading-snug text-muted-foreground/80">
          Towers are illustrations placed on the modelled path between substations, spaced for readability — not real tower positions.
          Zoom in for more detail. The dashed first/last miles have no towers: they aren't existing lines.
        </p>
      )}
    </div>
  );
}

export default function RouteCard({ planner, index, feeder, onClose, onScan, view3d }) {
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
                 sm:right-auto sm:bottom-auto sm:top-[68px] sm:w-[360px] sm:max-h-[calc(100%-7.5rem)]"
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
        {planner.endStates.from && planner.endStates.to && planner.endStates.from !== planner.endStates.to && (
          <p className="relative mt-1.5 text-[10.5px] text-muted-foreground">
            Cross-state: A is in <span className="font-semibold text-foreground">{planner.endStates.from}</span>, B in <span className="font-semibold text-foreground">{planner.endStates.to}</span>.
          </p>
        )}
        {planner.sameState && (
          <label className="relative mt-1.5 flex cursor-pointer items-center gap-2 text-[10.5px] text-muted-foreground">
            <input type="checkbox" checked={planner.keepInState} onChange={(e) => planner.setKeepInState(e.target.checked)} className="accent-[hsl(var(--primary))]" />
            Keep the route within <span className="font-semibold text-foreground">{planner.sameState}</span> where the network allows
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {(!from || !to) && (
          <p className="border-t border-border px-4 py-5 text-[11.5px] leading-relaxed text-muted-foreground">
            Pick where the power comes from and where it goes. Any place works: an Onction GenCo routes from its own grid connection; anything else joins the grid at its nearest built substation.
          </p>
        )}

        {from && to && (
          <Section icon={Path} title="Grid route" source={r ? "model" : null} how={r && {
            what: "A path electricity could take between A and B over the transmission lines in Onction's network model, with its length and estimated loss.",
            source: `Onction's network model of TCN substations and built lines. ${MODEL_DATA_NOTE}`,
            how: `Each end joins the grid at a substation (the nearest listed supply point unless you chose another). Between them, the shortest path over built lines (Dijkstra's algorithm); each line between two substations is one hop. Total = first mile + grid section + last mile. Grid loss = ${lossBreakdown(r) || `${r.loss_pct}%`}.`,
            limits: "A modelled path, not a confirmed physical route, capacity or supply contract. The model is simplified (±10% on distance). First/last miles aren't lines in the data. Losses are screening estimates and wheeling charges aren't included.",
            next: "Use it to compare options. Before committing, confirm the path, capacity and charges with TCN and the DisCos involved.",
          }}>
            {route.status === "loading" && <Skeleton lines={4} />}
            {route.status === "error" && <Problem>{route.message}</Problem>}
            {r && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={fmtKm(r.total_km)} unit="km" label="Total distance" />
                  <Stat value={r.loss_pct} unit="%" label={<Term term="grid loss">Grid loss (est.)</Term>} />
                  <Stat value={r.hop_count} unit="" label={r.hop_count === 1 ? "Grid hop" : "Grid hops"} />
                </div>
                <DistanceBar first={r.first_mile_km || 0} grid={r.routed_km} last={r.last_mile_km || 0}
                             firstHow={mileHow(r.first_mile_km, r.first_mile_geometry)} lastHow={mileHow(r.last_mile_km, r.last_mile_geometry)} />
                <div className="flex flex-wrap items-center gap-y-1 text-[10.5px]">
                  {path.map((n, i) => {
                    const outside = r.scope?.outside_nodes.find(o => o.node === n);
                    return (
                      <span key={`${n}-${i}`} className="flex items-center">
                        {i > 0 && <CaretRight className="mx-0.5 h-2.5 w-2.5 text-muted-foreground" />}
                        <span className={`rounded px-1.5 py-0.5 ${outside ? "bg-amber-500/15 text-amber-500" : i === 0 || i === path.length - 1 ? "bg-primary/15 font-semibold text-foreground" : "bg-muted text-foreground/85"}`}>
                          {n}{outside?.state && <span className="opacity-80"> · {outside.state}</span>}
                        </span>
                      </span>
                    );
                  })}
                </div>
                {(r.source_join || r.dest_join) && (
                  <div className="space-y-1.5">
                    <JoinPicker end="from" label="A" node={r.source_node} join={r.source_join} onChange={planner.chooseNode} />
                    <JoinPicker end="to" label="B" node={r.injection_node} join={r.dest_join} onChange={planner.chooseNode} />
                  </div>
                )}
                {r.scope && (r.scope.stays_in_state ? (
                  <p className="text-[10.5px] text-emerald-500">Stays within {r.scope.state} the whole way.</p>
                ) : (
                  <Problem>
                    No built line links these substations inside {r.scope.state} in the network data, so the connection runs through{" "}
                    {[...new Set(r.scope.outside_nodes.map(o => `${o.node}${o.state ? ` (${o.state})` : ""}`))].join(", ")}.
                    {r.scope.extra_km_for_scope > 0 && ` Keeping as much as possible in ${r.scope.state} adds ${r.scope.extra_km_for_scope} km over the shortest path (${r.scope.shortest_path_km} km).`}
                  </Problem>
                ))}
                {[["Start", r.scope?.source_snap], ["End", r.scope?.dest_snap]].map(([which, snap]) => snap?.choice === "in-state-too-far" && snap.nearest_in_state && (
                  <p key={which} className="text-[10px] text-muted-foreground">
                    {which}: the nearest {r.scope.state} supply point ({snap.nearest_in_state.node}, {snap.nearest_in_state.km} km) is much farther than one across the boundary, so the nearer one is used.
                  </p>
                ))}
                {straightKm != null && straightKm > 1 && (
                  <p className="text-[10px] text-muted-foreground" data-testid="route-straight">
                    Straight line A → B: {fmtKm(straightKm)} km. The full route is <span className="text-foreground">{(r.total_km / straightKm).toFixed(2)}×</span> that.
                    {(r.first_mile_km || 0) + (r.last_mile_km || 0) > 0 && (
                      <> Of the {fmtKm(r.total_km)} km, {fmtKm((r.first_mile_km || 0) + (r.last_mile_km || 0))} km is first/last mile to the nearest supply point, which is not an existing line.</>
                    )}
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
                <View3D v={view3d} />
                <p className="text-[9.5px] leading-snug text-muted-foreground/80" data-testid="route-loss-note">
                  Grid loss is a screening estimate at {(r.loss_model?.label || "base loading").toLowerCase()}, not a NERC loss factor:{" "}
                  {lossBreakdown(r) || `${r.loss_pct}%`}. It covers the grid section only. First/last-mile losses and TCN/DisCo wheeling charges are not included, so real losses and costs will be higher.
                </p>
              </div>
            )}
          </Section>
        )}

        {/* A: where power comes from */}
        {from && (
          <Section icon={Lightning} title={`A · ${from.name}`} source={isGenco ? "model" : null} delay={0.04}>
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
                Not an Onction GenCo — joins the grid at <span className="font-semibold text-foreground">{r.source_node}</span>{r.source_join?.choice === "manual" ? " (your choice)" : ""}, {r.first_mile_km} km away {r.first_mile_geometry ? "by road" : "in a straight line"}. No tariff on record, so no delivered cost is shown.
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
