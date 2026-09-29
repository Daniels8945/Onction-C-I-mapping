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
  Section, Skeleton, Problem, AVAIL_CLS, FAR_FROM_GRID_KM, SupplyBlock, DemandBlock, SolarBlock,
} from "./cardParts";

export default function ScanCard({ scan, feeder, onClose, onRescan, onRoute, onPin, onPlanRoute }) {
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
                 sm:right-auto sm:bottom-auto sm:top-3 sm:w-[340px] sm:max-h-[calc(100%-5.5rem)]"
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
        <Section icon={Plug} title="Grid connection" source={src?.status === "ready" ? "live" : null}>
          {src?.status === "loading" && <Skeleton lines={1} />}
          {src?.status === "error" && <Problem>{src.message}</Problem>}
          {src?.status === "ready" && (
            <p className="text-[12px] text-foreground">
              <span className="font-semibold">{src.injectionNode}</span>
              <span className="text-muted-foreground"> · last mile </span>
              <span className="font-mono font-semibold">{src.lastMileKm} km</span>
              <span className="text-muted-foreground"> {src.lastMileRoad ? "by road" : "straight-line"}</span>
            </p>
          )}
          {src?.status === "ready" && src.lastMileKm > FAR_FROM_GRID_KM && (
            <div className="mt-2">
              {src.nearestBuilt && !src.nearestBuilt.injection && src.nearestBuilt.km < src.lastMileKm / 2 ? (
                <Problem>
                  {src.nearestBuilt.name} ({src.nearestBuilt.kv} kV) is {src.nearestBuilt.km < 1 ? "right beside the site" : `only ${src.nearestBuilt.km} km away`}, but it isn't a supply point for C&amp;I customers in the current network model. The nearest one is {src.lastMileKm} km away.
                </Problem>
              ) : (
                <Problem>Far from the built grid: a {src.lastMileKm} km connection would be a major project. On-site generation may be the realistic option.</Problem>
              )}
            </div>
          )}
        </Section>

        {/* Best grid sources */}
        <Section icon={Lightning} title="Best grid sources" source={src?.status === "ready" ? "live" : null} delay={0.04}>
          {src?.status === "loading" && <Skeleton lines={3} />}
          {src?.status === "error" && <Problem>Grid sources need the routing API.</Problem>}
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
                        {r.total_km} km · {r.loss_pct}% loss
                        {r.indicativeNgnKwh != null && <> · <span className="text-foreground">₦{r.indicativeNgnKwh.toFixed(1)}</span>/kWh</>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[9.5px] leading-snug text-muted-foreground/80">
                Ranked by availability, then delivered energy cost (GenCo tariff + transmission losses). TCN and DisCo wheeling charges are not included yet. {src.total} GenCos checked.
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
