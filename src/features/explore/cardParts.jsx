import { motion } from "motion/react";
import { WarningCircle, Buildings, Crosshair, SunDim } from "@phosphor-icons/react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatWat } from "@/features/feeders/useFeederLive";
import { discoSupply } from "./siteScan";
import { MODEL_DATA_NOTE } from "@/data/provenance";

// Building blocks for the Explore cards (ScanCard, RouteCard): provenance
// badges, section chrome, meters, and the per-site stat blocks.

// Provenance badges — every figure on the card says how much to trust it.
// "Live" is reserved for metered feeder data (feederBadge); routing results
// are calculated on request but from a fixed dataset, so they're "Model".
export const SOURCE_BADGE = {
  model:    { label: "Model",    cls: "bg-indigo-500/15 text-indigo-400",   tip: MODEL_DATA_NOTE },
  onction:  { label: "Onction",  cls: "bg-primary/15 text-primary",         tip: "Onction's own engagement data." },
  estimate: { label: "Estimate", cls: "bg-muted text-muted-foreground",     tip: "A rule-of-thumb figure, not a measurement." },
};

// The DisCo supply badge depends on what useFeederLive currently has.
export function feederBadge(feeder) {
  const at = formatWat(feeder.data.capturedAt);
  if (feeder.mode === "live") return { label: "Live", cls: "bg-emerald-500/15 text-emerald-500", tip: `Metered feeder readings, updated every minute. Last reading ${at}.` };
  if (feeder.mode === "delayed") return { label: "Delayed", cls: "bg-amber-500/15 text-amber-500", tip: `The live feed has fallen behind — last reading ${at}.` };
  return { label: "Snapshot", cls: "bg-sky-500/15 text-sky-500", tip: `Live feed unavailable — showing real feeder readings frozen at ${at}.` };
}

export const AVAIL_CLS = {
  available: "text-emerald-500 border-emerald-500/40",
  earmarked: "text-amber-500 border-amber-500/40",
  committed: "text-muted-foreground border-border",
  over:      "text-red-400 border-red-400/40",
  unknown:   "text-muted-foreground border-border",
};

export function Source({ kind, badge }) {
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

// Plain-language definitions for the terms the cards rely on.
export const GLOSSARY = {
  "supply point": "A substation listed in Onction's data as able to supply C&I customers. Nearby high-voltage stations aren't automatically supply points.",
  "unconfirmed": "Built and on the grid, but not listed as a C&I supply point in Onction's data. Using it is your assumption.",
  "straight line": "Distance as the crow flies. Real cable or road routes are longer.",
  "by road": "Road distance from the routing service. A new line would likely follow a similar corridor, but this isn't a surveyed route.",
  "last mile": "From the grid supply point to the site. There's no line here in the data: it's the connection that would have to be built.",
  "first mile": "From the starting point to where it joins the grid. There's no line here in the data.",
  "grid section": "The part of the route along transmission lines in Onction's simplified network model, substation to substation.",
  "modelled path": "The shortest path over built lines in the network model. It shows that a path exists in the model, not that capacity or a contract is in place.",
  "grid loss": "A screening estimate: 2% for transformation plus 1% per 100 km of grid line at base loading. Not a NERC loss factor.",
};

// A term with its definition one hover / tap away.
export function Term({ children, term }) {
  const tip = GLOSSARY[(term || String(children)).toLowerCase()];
  if (!tip) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-2">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] font-normal">{tip}</TooltipContent>
    </Tooltip>
  );
}

// "How this was worked out" — the same six answers for every result: what
// it is, where the data comes from, how it's calculated, what it can't tell
// you, and what to do next. Collapsed by default so the card stays short.
export function HowItWorks({ what, source, how, limits, next }) {
  const rows = [["What this is", what], ["Where the data comes from", source], ["How it's worked out", how], ["What it can't tell you", limits], ["What to do next", next]].filter(([, v]) => v);
  return (
    <details className="group mt-2 rounded-md border border-border/70 px-2 py-1 text-[10.5px]" data-testid="how-it-works">
      <summary className="cursor-pointer select-none text-[10px] font-semibold text-muted-foreground hover:text-foreground">How this was worked out</summary>
      <dl className="mt-1.5 space-y-1.5 pb-1">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{k}</dt>
            <dd className="leading-snug text-foreground/85">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function Section({ icon: Icon, title, source, badge, children, delay = 0, how }) {
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
      {how && <HowItWorks {...how} />}
    </motion.section>
  );
}

export function Skeleton({ lines = 2 }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${85 - i * 20}%` }} />
      ))}
    </div>
  );
}

export function Problem({ children }) {
  return <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground"><WarningCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />{children}</p>;
}

export function Meter({ pct, tone }) {
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
export function Sparkline({ points, tone }) {
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

// What a route's loss figure is made of, in words: the loss model is a
// screening rule (fixed transformation loss + a rate per 100 km of grid
// line), applied to the grid section only.
export function lossBreakdown(r) {
  const m = r.loss_model;
  if (!m || m.fixed_pct == null || m.per_100km_pct == null) return null;
  return `${m.fixed_pct}% transformation + ${m.per_100km_pct}% per 100 km × ${r.routed_km} km of grid line = ${r.loss_pct}%`;
}

// Beyond this, "nearest substation" stops meaning "easy connection".
export const FAR_FROM_GRID_KM = 50;

export const supplyTone = (pct) => (pct >= 60 ? "#10b981" : pct >= 35 ? "#f5a623" : "#ef4444");

// ── Site stat blocks, shared by the scan card and the route card ──────────

// DisCo supply for a site, from the current feeder feed (live or snapshot).
export function SupplyBlock({ supply, feeder, title = "DisCo supply today", delay = 0.08 }) {
  const discos = supply?.status === "ready" ? discoSupply(supply.discoIds, feeder.data) : [];
  return (
    <Section icon={Buildings} title={title} badge={supply?.status === "ready" ? feederBadge(feeder) : null} delay={delay} how={supply?.status === "ready" && {
      what: "How reliably the local DisCo's 33/11 kV feeders are supplying power today.",
      source: `Feeder readings from the feeder-compliance service — ${feeder.mode === "live" ? "live, refreshed every minute" : feeder.mode === "delayed" ? "the live feed has fallen behind" : "a dated snapshot, because the live feed isn't connected"}. The DisCo is matched by state.`,
      how: "Feeders on = feeders reporting supply now ÷ all metered feeders. Availability = average hours on ÷ hours into the feed's day. The feed's day doesn't start at midnight (it resets around 08:00 WAT), so that's measured from the feed itself.",
      limits: "This is DisCo-wide, not this site's own feeder. DisCo areas follow feeders, not state lines, so border sites may be served by a neighbour.",
      next: "Ask the DisCo which feeder would serve the site and for its recent supply hours.",
    }}>
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
                ~{d.availabilityPct}% availability (feed's day) · {d.shedding} shedding now · dedicated {d.dedicatedOnline}/{d.dedicated} on
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
  );
}

export function DemandBlock({ demand, delay = 0.12 }) {
  return (
    <Section icon={Crosshair} title={`Demand within ${demand.radiusKm} km`} source="onction" delay={delay} how={{
      what: `Other electricity users near this site that Onction already knows about.`,
      source: "Onction's offtaker list and its list of C&I anchor loads in this app.",
      how: `Counted by straight-line distance of ${demand.radiusKm} km or less. MW is the offtakers' contracted capacity.`,
      limits: "Only customers in Onction's lists, not the whole market. Nearby demand doesn't mean a shared connection is possible.",
    }}>
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
  );
}

export function SolarBlock({ solar, delay = 0.16 }) {
  return (
    <Section icon={SunDim} title="Solar resource" source="estimate" delay={delay} how={{
      what: "Roughly how much energy a solar array here would produce per kW installed, per year.",
      source: "A rule of thumb for Nigeria by latitude: about 1,300 kWh/kWp on the coast to 1,750 in the far north.",
      how: "Interpolated from this site's latitude.",
      limits: "Not a measurement: no local weather, shading, tilt or losses.",
      next: "For a design, use a site study (e.g. PVGIS or NASA POWER data).",
    }}>
      <p className="text-[12px] text-foreground">
        ≈ <span className="font-mono font-semibold">{solar.kwhPerKwp.toLocaleString()}</span>
        <span className="text-muted-foreground"> kWh per kWp per year</span>
      </p>
    </Section>
  );
}
