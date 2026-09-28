import { useState } from "react";
import { motion } from "motion/react";
import {
  Crosshair, X, Path, PushPin, Copy, Check, Lightning, SunDim, Buildings, Plug, WarningCircle, ArrowClockwise,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatWat } from "@/features/feeders/useFeederLive";
import { RANK_COLORS } from "./useSiteScan";
import { scanSummaryText, discoSupply } from "./siteScan";

// Provenance badges — every figure on the card says how much to trust it.
const SOURCE_BADGE = {
  live:     { label: "Live",     cls: "bg-emerald-500/15 text-emerald-500", tip: "Computed now by the Onction grid routing API." },
  onction:  { label: "Onction",  cls: "bg-primary/15 text-primary",         tip: "Onction's own engagement data." },
  estimate: { label: "Estimate", cls: "bg-muted text-muted-foreground",     tip: "A rule-of-thumb figure, not a measurement." },
};

// The DisCo supply badge depends on what useFeederLive currently has.
function feederBadge(feeder) {
  const at = formatWat(feeder.data.capturedAt);
  if (feeder.mode === "live") return { label: "Live", cls: "bg-emerald-500/15 text-emerald-500", tip: `Metered feeder readings, updated every minute. Last reading ${at}.` };
  if (feeder.mode === "delayed") return { label: "Delayed", cls: "bg-amber-500/15 text-amber-500", tip: `The live feed has fallen behind — last reading ${at}.` };
  return { label: "Snapshot", cls: "bg-sky-500/15 text-sky-500", tip: `Live feed unavailable — showing real feeder readings frozen at ${at}.` };
}

const AVAIL_CLS = {
  available: "text-emerald-500 border-emerald-500/40",
  earmarked: "text-amber-500 border-amber-500/40",
  committed: "text-muted-foreground border-border",
  over:      "text-red-400 border-red-400/40",
  unknown:   "text-muted-foreground border-border",
};

function Source({ kind, badge }) {
  const b = badge || SOURCE_BADGE[kind];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider cursor-help ${b.cls}`}>{b.label}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px] font-normal">{b.tip}</TooltipContent>
    </Tooltip>
  );
}

function Section({ icon: Icon, title, source, badge, children, delay = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay }}
      className="border-t border-border px-4 py-3"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="flex-1 text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
        {(source || badge) && <Source kind={source} badge={badge} />}
      </div>
      {children}
    </motion.section>
  );
}

function Skeleton({ lines = 2 }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${85 - i * 20}%` }} />
      ))}
    </div>
  );
}

function Problem({ children }) {
  return <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground"><WarningCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />{children}</p>;
}

function Meter({ pct, tone }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <motion.div
        initial={{ width: 0 }} animate={{ width: `${Math.max(2, Math.min(100, pct))}%` }} transition={{ duration: 0.7, ease: "easeOut" }}
        className="h-full rounded-full" style={{ background: tone }}
      />
    </div>
  );
}

// Share of feeders online, hour by hour over the last 24h.
function Sparkline({ points, tone }) {
  if (!points || points.length < 2) return null;
  const W = 72, H = 18;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - (Math.max(0, Math.min(100, p.onlinePct)) / 100) * H]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" role="img"
         aria-label={`Feeders online over the last ${points.length} hours: from ${points[0].onlinePct}% to ${points[points.length - 1].onlinePct}%`}>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={tone} opacity="0.15" />
      <path d={d} fill="none" stroke={tone} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2" fill={tone} />
    </svg>
  );
}

// Beyond this, "nearest substation" stops meaning "easy connection".
const FAR_FROM_GRID_KM = 50;

const supplyTone = (pct) => (pct >= 60 ? "#10b981" : pct >= 35 ? "#f5a623" : "#ef4444");

export default function ScanCard({ scan, feeder, onClose, onRescan, onRoute, onPin }) {
  const [copied, setCopied] = useState(false);
  const { location: loc, sources: src, supply, demand, solar } = scan;
  const best = src?.status === "ready" ? src.top[0] : null;
  // Recomputed every render, so an open card follows the minute-by-minute feed.
  const discos = supply?.status === "ready" ? discoSupply(supply.discoIds, feeder.data) : [];
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

        {/* DisCo supply */}
        <Section icon={Buildings} title="DisCo supply today" badge={supply?.status === "ready" ? feederBadge(feeder) : null} delay={0.08}>
          {supply?.status === "loading" && <Skeleton lines={2} />}
          {(supply?.status === "error" || supply?.status === "empty") && <Problem>{supply.message}</Problem>}
          {supply?.status === "ready" && (
            <div className="space-y-2.5">
              {discos.map(d => (
                <div key={d.id}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[12px] font-semibold text-foreground">{d.id}</span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      <span className="text-foreground">{d.online}</span>/{d.feeders} feeders on
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1"><Meter pct={d.availabilityPct} tone={supplyTone(d.availabilityPct)} /></div>
                    <Sparkline points={d.trend} tone={supplyTone(d.availabilityPct)} />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    ~{d.availabilityPct}% availability today · {d.shedding} shedding now · dedicated {d.dedicatedOnline}/{d.dedicated} on
                  </p>
                </div>
              ))}
              {supply.note && <p className="text-[9.5px] text-muted-foreground/80">{supply.note}</p>}
              {supply.discoIds.some(id => !discos.find(d => d.id === id)) && (
                <p className="text-[9.5px] text-muted-foreground/80">No metered feeders for {supply.discoIds.filter(id => !discos.find(d => d.id === id)).join(", ")}.</p>
              )}
            </div>
          )}
        </Section>

        {/* Nearby demand */}
        <Section icon={Crosshair} title={`Demand within ${demand.radiusKm} km`} source="onction" delay={0.12}>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-muted/60 px-2.5 py-2">
              <p className="font-mono text-base font-bold leading-none text-foreground">{demand.offtakers.length}</p>
              <p className="mt-1 text-[9.5px] text-muted-foreground">Onction offtakers{demand.offtakerMw ? ` · ${demand.offtakerMw} MW` : ""}</p>
            </div>
            <div className="rounded-md bg-muted/60 px-2.5 py-2">
              <p className="font-mono text-base font-bold leading-none text-foreground">{demand.ciCount}</p>
              <p className="mt-1 text-[9.5px] text-muted-foreground">C&amp;I anchor loads</p>
            </div>
          </div>
          {demand.offtakers.length > 0 && <p className="mt-1.5 truncate text-[10px] text-muted-foreground">{demand.offtakers.join(" · ")}</p>}
        </Section>

        {/* Solar */}
        <Section icon={SunDim} title="Solar resource" source="estimate" delay={0.16}>
          <p className="text-[12px] text-foreground">
            ≈ <span className="font-mono font-semibold">{solar.kwhPerKwp.toLocaleString()}</span>
            <span className="text-muted-foreground"> kWh per kWp per year</span>
          </p>
        </Section>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 border-t border-border px-3 py-2.5">
        <Button size="sm" className="flex-1" disabled={!best} onClick={() => onRoute(best)}>
          <Path className="h-3.5 w-3.5" /> Route best source
        </Button>
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
