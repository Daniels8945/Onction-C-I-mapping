import { useState } from "react";
import { motion } from "motion/react";
import {
  Crosshair, X, Path, PushPin, Copy, Check, Lightning, Plug, ArrowClockwise, ArrowsLeftRight,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { RANK_COLORS } from "./useSiteScan";
import { scanSummaryText } from "./siteScan";
import {
  Section, Skeleton, Problem, AVAIL_CLS, FAR_FROM_GRID_KM, SupplyBlock, DemandBlock, SolarBlock, Term,
} from "./cardParts";
import { MODEL_DATA_NOTE } from "@/data/provenance";

// The substations this site could connect at: the current one highlighted,
// the rest one tap away. Listed supply points and unconfirmed ones look
// different, so choosing an unconfirmed one is a visible decision.
function SupplyChoices({ src, onChoose }) {
  return (
    <div className="mt-2.5" data-testid="supply-choices">
      <p className="mb-1 text-[10px] text-muted-foreground">Connect at a different substation (or click one on the map):</p>
      <div className="flex flex-wrap gap-1">
        {src.options.map(o => {
          const current = o.name === src.injectionNode;
          return (
            <button key={o.name} type="button" onClick={() => !current && onChoose(o.name)} aria-pressed={current}
                    title={o.supply_point ? "Listed supply point" : "Not confirmed as a supply point"}
                    className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] transition-colors
                      ${current ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
              <span className="font-semibold">{o.name}</span>
              <span className="font-mono">{o.km} km</span>
              {!o.supply_point && <span className="rounded bg-amber-500/15 px-1 text-[8.5px] font-semibold text-amber-500">unconfirmed</span>}
            </button>
          );
        })}
      </div>
      {src.choice === "manual" && (
        <button type="button" onClick={() => onChoose(null)} className="mt-1.5 text-[10.5px] text-primary hover:underline">
          Back to the nearest listed supply point
        </button>
      )}
    </div>
  );
}

export default function ScanCard({ scan, feeder, onClose, onRescan, onRoute, onPin, onPlanRoute, onChooseSupply }) {
  const [copied, setCopied] = useState(false);
  const { location: loc, sources: src, supply, demand, solar } = scan;
  const best = src?.status === "ready" ? src.top[0] : null;
  const title = scan.label || (loc?.status === "ready" ? loc.place || "Unnamed area" : null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(scanSummaryText(scan, feeder));
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked — nothing useful to do */ }
  };

  return (
    <motion.aside
      data-testid="scan-card"
      initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute left-3 right-3 bottom-3 top-auto z-[26] flex max-h-[55%] flex-col overflow-hidden rounded-xl border border-border shadow-2xl backdrop-blur-md
                 sm:right-auto sm:bottom-auto sm:top-[68px] sm:w-[340px] sm:max-h-[calc(100%-7.5rem)]"
      style={{ background: "color-mix(in srgb, hsl(var(--card)) 94%, transparent)" }}
      aria-label="Site scan results"
    >
      {/* Header */}
      <div className="relative overflow-hidden px-4 pb-3 pt-3.5">
        <div className="pointer-events-none absolute inset-0 opacity-60"
             style={{ background: "radial-gradient(120% 90% at 0% 0%, hsl(var(--primary) / 0.18), transparent 60%)" }} />
        <div className="relative flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Crosshair className="h-4 w-4" weight="bold" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">Site scan</p>
            {title
              ? <p className="truncate text-sm font-semibold text-foreground">{title}</p>
              : <div className="mt-1 h-4 w-40 animate-pulse rounded bg-muted" />}
            <p className="font-mono text-[10px] text-muted-foreground">
              {scan.lat.toFixed(4)}°N {scan.lng.toFixed(4)}°E
              {loc?.state && <> · {loc.state.replace(/ State$/, "")}</>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close scan" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Grid connection */}
        <Section icon={Plug} title="Grid connection" source={src?.status === "ready" ? "model" : null} how={src?.status === "ready" && {
          what: `Where this site would join the transmission grid (${src.injectionNode}) and how far that is.`,
          source: `Onction's network model of TCN substations and lines. ${MODEL_DATA_NOTE}`,
          how: src.choice === "manual"
            ? "You chose the substation. The last mile is the distance from it to the site."
            : `The nearest listed supply point to the site by straight-line distance, preferring one in the site's own state unless it's much farther (more than 15 km or 1.5× the nearest)${src.lastMileRoad ? "; the last mile is then measured by road" : ""}. Find a customer uses the same rule.`,
          limits: "Distance only: not line capacity, cost or whether a connection can be built. The 33/11 kV distribution network isn't mapped, so a nearer DisCo connection may exist. The supply-point list is still being confirmed.",
          next: "Compare the nearby substations below, then ask TCN or the DisCo about capacity at the one you'd use.",
        }}>
          {src?.status === "loading" && <Skeleton lines={1} />}
          {src?.status === "error" && <Problem>{src.message}</Problem>}
          {src?.status === "ready" && (
            <>
              <p className="text-[12px] text-foreground" data-testid="scan-supply">
                <span className="font-semibold">{src.injectionNode}</span>
                <span className="text-muted-foreground"> · <Term>last mile</Term> </span>
                <span className="font-mono font-semibold">{src.lastMileKm} km</span>
                <span className="text-muted-foreground"> <Term>{src.lastMileRoad ? "by road" : "straight line"}</Term></span>
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {src.choice === "manual" ? "Your choice of substation." : <>Picked automatically: the nearest listed <Term>supply point</Term>{src.state && src.snap?.choice === "in-state" ? ` in ${src.state}` : ""}.</>}
                {src.choice !== "manual" && src.snap?.nearest_overall && (
                  <> {src.snap.nearest_overall.node} in {src.snap.nearest_overall.state} is slightly nearer ({src.snap.nearest_overall.km} km); the {src.state} one is used to keep the connection in-state, as Find a customer does.</>
                )}
                {src.choice !== "manual" && src.snap?.choice === "in-state-too-far" && src.snap.nearest_in_state && (
                  <> The nearest one in {src.state} ({src.snap.nearest_in_state.node}, {src.snap.nearest_in_state.km} km) is much farther, so this one across the state boundary is used.</>
                )}
                {src.choice !== "manual" && src.snap?.choice === "no-in-state" && src.state && (
                  <> There's no listed supply point in {src.state}, so the nearest one elsewhere is used.</>
                )}
              </p>
            </>
          )}
          {src?.status === "ready" && !src.confirmed && (
            <div className="mt-2">
              <Problem>
                {src.injectionNode} isn't confirmed as a supply point for C&amp;I customers in Onction's data. The figures below assume it could supply this site.
              </Problem>
            </div>
          )}
          {src?.status === "ready" && src.choice === "auto" && src.lastMileKm > FAR_FROM_GRID_KM && (
            <div className="mt-2">
              {src.nearestBuilt && !src.nearestBuilt.injection && src.nearestBuilt.km < src.lastMileKm / 2 ? (
                <Problem>
                  {src.nearestBuilt.name} ({src.nearestBuilt.kv} kV) is {src.nearestBuilt.km < 1 ? "right beside the site" : `only ${src.nearestBuilt.km} km away`}, but Onction's network model doesn't list it as a supply point for C&amp;I customers (that list is still being confirmed). The nearest listed supply point, {src.injectionNode}, is {src.lastMileKm} km away{src.lastMileRoad ? " by road" : " in a straight line"}.
                </Problem>
              ) : (
                <Problem>Far from the built grid: a {src.lastMileKm} km connection would be a major project. On-site generation may be the realistic option.</Problem>
              )}
            </div>
          )}
          {src?.status === "ready" && src.options?.length > 0 && (
            <SupplyChoices src={src} onChoose={onChooseSupply} />
          )}
        </Section>

        {/* Best grid sources */}
        <Section icon={Lightning} title="Best grid sources" source={src?.status === "ready" ? "model" : null} delay={0.04} how={src?.status === "ready" && {
          what: "Onction's GenCos that could supply this site over the grid, best first.",
          source: `GenCo tariffs and commitments from Onction's deal data; routes over the network model. ${MODEL_DATA_NOTE}`,
          how: `For each GenCo: the shortest path over built lines from its substation to ${src.injectionNode}. Grid loss = 2% + 1% per 100 km of that path. Delivered cost = tariff ÷ (1 − loss). Ranked by availability (available, earmarked, committed, over-committed, no data), then delivered cost, then distance.`,
          limits: "Losses are screening estimates. The last mile, TCN and DisCo wheeling charges and line capacity aren't included, and tariffs are the invoice rates on record, so this is a comparison, not a price or an offer.",
          next: "Confirm availability and tariff with the GenCo, and get TCN/DisCo wheeling charges before quoting.",
        }}>
          {src?.status === "loading" && <Skeleton lines={3} />}
          {src?.status === "error" && <Problem>No ranking: the grid sources couldn't be loaded. Try again shortly.</Problem>}
          {src?.status === "empty" && <Problem>No GenCo can reach this point over existing lines.</Problem>}
          {src?.status === "ready" && (
            <>
              <ol className="space-y-2">
                {src.top.map((r, i) => (
                  <li key={r.genco} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-black" style={{ background: RANK_COLORS[i] }}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold text-foreground">{r.genco}</span>
                        <span className={`flex-shrink-0 rounded-full border px-1.5 text-[8.5px] font-semibold ${AVAIL_CLS[r.availability.key]}`}>{r.availability.label}</span>
                      </div>
                      <p className="font-mono text-[10.5px] text-muted-foreground">
                        {r.total_km} km route · {r.loss_pct}% grid loss (est.)
                        {r.indicativeNgnKwh != null && <> · <span className="text-foreground">₦{r.indicativeNgnKwh.toFixed(1)}</span>/kWh</>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[9.5px] leading-snug text-muted-foreground/80">
                Ranked by availability, then delivered energy cost (GenCo tariff grossed up for grid losses), then distance. {src.total} GenCos checked.
                Losses are screening estimates for the grid section only; the {src.lastMileKm} km last mile, TCN and DisCo wheeling charges are not costed, so this is a comparison, not a price.
              </p>
            </>
          )}
        </Section>

        <SupplyBlock supply={supply} feeder={feeder} />
        <DemandBlock demand={demand} />
        <SolarBlock solar={solar} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 border-t border-border px-3 py-2.5">
        <Button size="sm" className="flex-1" disabled={!best} onClick={() => onRoute(best)}>
          <Path className="h-3.5 w-3.5" /> Route best source
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => onPlanRoute("from")} aria-label="Route from this site to another place">
              <ArrowsLeftRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Route from here to another place</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="secondary" className="h-8 w-8" onClick={onPin} aria-label="Pin this site"><PushPin className="h-3.5 w-3.5" /></Button>
          </TooltipTrigger>
          <TooltipContent>Pin this site</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="secondary" className="h-8 w-8" onClick={copy} aria-label="Copy summary">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied" : "Copy summary"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="secondary" className="h-8 w-8" onClick={onRescan} aria-label="Scan another site"><ArrowClockwise className="h-3.5 w-3.5" /></Button>
          </TooltipTrigger>
          <TooltipContent>Scan another site</TooltipContent>
        </Tooltip>
      </div>
    </motion.aside>
  );
}
