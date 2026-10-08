import { useState } from "react";
import { motion } from "motion/react";
import { Plug, X, MapPin, ArrowRight, Lightning, Path, Copy, Check, PushPin, WarningCircle, Info, Cube, CheckCircle, ArrowsOut, CircleNotch, HandGrabbing, Eye, EyeSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Section, Skeleton, Problem } from "@/features/explore/cardParts";
import { ConfidenceBadge } from "./CustomerSearch";
import { STATUS_COLOR, LINE_STATUS_COLOR, RADIUS_OPTIONS } from "./useConnect";

// Connect a customer: find them → confirm where they are → what
// infrastructure is within the radius → the potential connection → an
// initial planning indication. The step strip and "Next" line keep the user
// oriented. Shows only what the dataset holds; nothing here is an
// engineering decision.

const LEVEL = {
  near:      { cls: "border-emerald-500/40 bg-emerald-500/10", dot: "#10b981" },
  moderate:  { cls: "border-amber-500/40 bg-amber-500/10",     dot: "#f5a623" },
  extension: { cls: "border-orange-500/40 bg-orange-500/10",   dot: "#f97316" },
  gap:       { cls: "border-red-500/40 bg-red-500/10",         dot: "#ef4444" },
};
const compass = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
const kvLabel = (kv) => (kv >= 330 ? "330/132 kV bulk substation" : kv >= 132 ? "132/33 kV substation" : `${kv} kV substation`);
const statusLabel = (s) => (s === "existing" ? "Existing" : s === "ongoing" ? "On-going" : "Proposed");
const lineKey = (l) => `${l.from_node}|${l.to_node}`;

function Chip({ children, tone = "muted" }) {
  const cls = { muted: "bg-muted text-muted-foreground", sky: "bg-sky-500/15 text-sky-500", violet: "bg-violet-500/15 text-violet-400",
    green: "bg-emerald-500/15 text-emerald-500", amber: "bg-amber-500/15 text-amber-500", red: "bg-red-500/15 text-red-400" }[tone];
  return <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-semibold ${cls}`}>{children}</span>;
}

function Row({ k, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border/60 py-1 text-[11px] first:border-t-0">
      <span className="flex-shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 text-right text-foreground">{children}</span>
    </div>
  );
}

// A site the geocoder only knows approximately needs the user's eye first.
const needsConfirm = (c) => c && !c.confirmed && !(c.confidence === "high" && c.precision === "site");

// Where the user is in the journey, and the one thing to do next.
function journey({ customer, assessment, selected }) {
  const a = assessment.data;
  const steps = [
    { key: "find", label: "Find", done: !!customer },
    { key: "confirm", label: "Confirm", done: !!customer && !needsConfirm(customer) },
    { key: "infra", label: "Network", done: !!a },
    { key: "connect", label: "Connection", done: !!selected },
    { key: "indication", label: "Indication", done: !!a && !!selected },
  ];
  let next;
  if (!customer) next = "Search for the customer above, or drop a pin where they are.";
  else if (needsConfirm(customer)) next = customer.precision === "area"
    ? "This pin is the centre of an area, not the site. Drag it to the customer's site, then confirm."
    : "Check the pin is on the customer's site — drag it if not, then confirm.";
  else if (assessment.status === "loading" && !a) next = "Finding infrastructure around the customer…";
  else if (assessment.status === "error") next = "Couldn't reach the grid API — try again in a moment.";
  else if (a?.radius_summary?.empty) next = `No grid supply point within ${a.radius_km} km — widen the radius or inspect the wider region.`;
  else if (selected) next = "Hover or click the map's substations and lines to compare, or read the indication below.";
  else next = "Pick a substation to see the potential connection.";
  const current = steps.findIndex(s => !s.done);
  return { steps, current: current === -1 ? steps.length : current, next };
}

function Stepper({ steps, current }) {
  return (
    <ol className="flex items-center gap-1 px-4 pb-1" aria-label="Connection check progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex min-w-0 flex-1 flex-col gap-1" aria-current={i === current ? "step" : undefined}>
          <span className={`h-1 rounded-full ${s.done ? "bg-primary" : i === current ? "bg-primary/45" : "bg-muted"}`} />
          <span className={`truncate text-[8.5px] font-semibold uppercase tracking-wider ${s.done || i === current ? "text-foreground" : "text-muted-foreground/70"}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function connectSummaryText({ customer, label, assessment, selected, line }) {
  const a = assessment.data;
  const cand = a?.candidates.find(c => c.name === selected);
  const lines = [`Onction connection check — ${label || customer.name}`];
  lines.push(`Location: ${[customer.address, customer.lga, customer.state].filter(Boolean).join(", ")} (${customer.lat.toFixed(5)}, ${customer.lng.toFixed(5)})`);
  if (a?.radius_summary) lines.push(`Within ${a.radius_km} km: ${a.radius_summary.message}`);
  if (cand) {
    lines.push(`Infrastructure: ${cand.name} — ${kvLabel(cand.voltage_kv)}, ${cand.status}${cand.supply_point ? ", grid supply point" : ""} (${[cand.lga, cand.state].filter(Boolean).join(", ")})`);
    lines.push(`Distance: ${cand.distance_km} km straight line${line?.road_km ? `, ${line.road_km} km by road` : ""}`);
  }
  if (a) {
    lines.push(`Indication: ${a.assessment.title} — ${a.assessment.summary}`);
    a.assessment.considerations.forEach(c => lines.push(`  • ${c}`));
    lines.push(a.assessment.disclaimer);
  }
  return lines.join("\n");
}

function LineDetail({ l, onClose }) {
  return (
    <div data-testid="line-detail" className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="h-0.5 w-4 rounded" style={{ background: LINE_STATUS_COLOR[l.status] }} />
        <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">{l.from_node} – {l.to_node}</p>
        <button onClick={onClose} aria-label="Close line details" className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <Row k="Type">Transmission line · {l.voltage_kv} kV <span className="text-muted-foreground">(inferred)</span></Row>
      <Row k="Status">{l.status === "existing" ? "Existing (built)" : l.status === "ongoing" ? "On-going — not yet in service" : "Proposed — not built"}</Row>
      <Row k="Length">{l.line_km} km</Row>
      <Row k="Closest to customer">~{l.distance_km} km</Row>
      <Row k="States">{l.from_state === l.to_state ? l.from_state || "—" : `${l.from_state || "outside Nigeria"} → ${l.to_state || "outside Nigeria"}`}</Row>
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        Drawn as a straight span between its substations; tower positions in 3D are illustrative.
        {l.status === "existing" ? " Tapping a line directly would itself need a new substation." : ""}
      </p>
    </div>
  );
}

export default function ConnectCard({ connect, onClose, onSources, onRoute, onPin }) {
  const [copied, setCopied] = useState(false);
  const { customer, label, assessment, selected, line, preferState, radiusKm, focusedLine } = connect;
  const a = assessment.data;
  const cand = a?.candidates.find(c => c.name === selected);
  const level = a ? LEVEL[a.assessment.level] : null;
  const { steps, current, next } = journey(connect);
  const rs = a?.radius_summary;
  const nextRadius = RADIUS_OPTIONS.find(r => r > (a?.radius_km ?? radiusKm));

  const copy = async () => {
    try { await navigator.clipboard.writeText(connectSummaryText(connect)); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
  };

  const inScope = a?.candidates.filter(c => !a.scope_state || c.state === a.scope_state) || [];
  const outScope = a?.candidates.filter(c => a.scope_state && c.state !== a.scope_state) || [];

  const candRow = (c, i) => {
    const sel = c.name === selected;
    const hidden = connect.view.hidden.includes(c.name);
    return (
      <li key={c.name} className="group flex items-center gap-0.5">
        <button
          onClick={() => connect.select(c.name)} aria-pressed={sel} data-testid="candidate"
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${sel ? "ring-1 ring-primary/50" : "hover:bg-accent/60"} ${selected && !sel ? "opacity-75" : ""} ${hidden ? "opacity-45" : ""}`}
          style={sel ? { background: "hsl(var(--primary) / 0.12)" } : undefined}
        >
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold"
                style={{ border: `2px solid ${STATUS_COLOR[c.status] || "#94a3b8"}`, background: c.supply_point ? STATUS_COLOR[c.status] : "transparent", color: c.supply_point ? "#04121f" : "inherit" }}>
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[12px] font-semibold text-foreground">{c.name}</span>
              {c.recommended && <Chip tone="green">Suggested</Chip>}
            </span>
            <span className="mt-0.5 flex flex-wrap gap-1">
              <Chip>{c.voltage_kv} kV</Chip>
              <Chip tone={c.status === "existing" ? "sky" : "violet"}>{c.status === "existing" ? "Existing" : c.status === "ongoing" ? "On-going" : "Proposed"}</Chip>
              {c.status === "existing" && (c.supply_point ? <Chip tone="green">Supply point</Chip> : <Chip>Not a supply point</Chip>)}
              {c.state && <Chip tone={c.same_state ? "muted" : "amber"}>{c.state}</Chip>}
              {c.in_radius === false && <Chip tone="amber">Beyond {a.radius_km} km</Chip>}
            </span>
          </span>
          <span className="flex-shrink-0 font-mono text-[12px] font-semibold text-foreground">{c.distance_km}<span className="text-[9.5px] text-muted-foreground"> km</span></span>
        </button>
        {/* Hide just this one on the map (it stays in this list and in the analysis). */}
        <button onClick={() => connect.toggleHidden(c.name)} disabled={sel} data-testid="candidate-visibility"
                aria-label={hidden ? `Show ${c.name} on the map` : `Hide ${c.name} on the map`} aria-pressed={!hidden}
                title={sel ? "This is the connection you're evaluating" : hidden ? "Show on the map" : "Hide on the map"}
                className={`flex h-7 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-0 ${hidden ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}>
          {hidden ? <EyeSlash className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </li>
    );
  };

  return (
    <motion.aside
      data-testid="connect-card"
      initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute left-3 right-3 bottom-3 top-auto z-[26] flex max-h-[58%] flex-col overflow-hidden rounded-xl border border-border shadow-2xl backdrop-blur-md
                 sm:right-auto sm:bottom-auto sm:top-[68px] sm:w-[400px] sm:max-h-[calc(100%-7.5rem)]"
      style={{ background: "color-mix(in srgb, hsl(var(--card)) 95%, transparent)" }}
      aria-label="Connect a customer"
    >
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary"><Plug className="h-4 w-4" weight="bold" /></div>
        <p className="flex-1 text-[9px] font-bold uppercase tracking-[0.2em] text-primary">Connect a customer</p>
        {customer && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={connect.toggle3D} aria-pressed={connect.threeD} aria-label="3D view" data-testid="toggle-3d"
                      className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold ${connect.threeD ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                {connect.threeDStatus === "loading" ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <Cube className="h-3.5 w-3.5" />}3D
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[220px]">
              {connect.threeDStatus === "error" ? "3D couldn't start on this device — the 2D map still shows everything." : connect.threeD ? "Switch to the flat map" : "Miniature 3D view of the substations, lines and connection"}
            </TooltipContent>
          </Tooltip>
        )}
        <button onClick={onClose} aria-label="Close connection check" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <Stepper steps={steps} current={current} />
      <p data-testid="next-step" className="flex items-start gap-1.5 px-4 pb-2.5 pt-1 text-[11px] leading-snug text-foreground/90">
        <ArrowRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" weight="bold" />{next}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!customer && connect.dropping && (
          <p className="border-t border-border px-4 py-5 text-[11.5px] leading-relaxed text-muted-foreground">Click the customer's location on the map.</p>
        )}

        {/* 1 · Customer */}
        {customer && (
          <Section icon={MapPin} title="1 · Customer location">
            <input
              value={label} onChange={(e) => connect.setLabel(e.target.value)} placeholder="Customer name (e.g. ABC Manufacturing Ltd)"
              aria-label="Customer name"
              className="mb-1.5 h-8 w-full rounded-md border border-border bg-background/60 px-2.5 text-[13px] font-semibold text-foreground outline-none focus:border-primary/70"
            />
            {customer.address && customer.address !== label && <p className="text-[11px] text-foreground/85">{customer.address}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {customer.state ? <Chip>{[customer.lga, customer.state].filter(Boolean).join(" · ")}</Chip> : <Chip tone="red">Outside the state boundaries</Chip>}
              {customer.type_label && <Chip>{customer.type_label}</Chip>}
              <ConfidenceBadge confidence={customer.confidence} precision={customer.precision} />
              <span className="font-mono text-[10px] text-muted-foreground" data-testid="customer-coords">{customer.lat.toFixed(5)}, {customer.lng.toFixed(5)}</span>
            </div>
            {customer.confidence_reason && <p className="mt-1 text-[10.5px] text-muted-foreground">{customer.confidence_reason}</p>}
            {needsConfirm(customer) ? (
              <div data-testid="confirm-location" className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-foreground"><HandGrabbing className="h-3.5 w-3.5 text-amber-500" /> Is this exactly where the customer is?</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-foreground/80">
                  {customer.precision === "area" ? "Search found the area, not the site. " : customer.precision === "address" ? "Search found the street, not the site. " : "Search isn't sure about this match. "}
                  Drag the red pin onto the site — distances below update as you do.
                </p>
                <Button size="sm" variant="secondary" className="mt-1.5 h-7 text-[11px]" onClick={connect.confirmLocation}>
                  <CheckCircle className="h-3.5 w-3.5" /> Yes, this is the site
                </Button>
              </div>
            ) : (
              <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-primary/90">
                <Info className="h-3 w-3" /> Drag the pin on the map to the exact site — everything below updates.
              </p>
            )}
          </Section>
        )}

        {/* 2 · Nearby infrastructure */}
        {customer && (
          <Section icon={Plug} title="2 · Nearby infrastructure" source={a ? "live" : null} delay={0.03}>
            <div className="mb-2 flex items-center gap-1" role="group" aria-label="Search radius">
              <span className="mr-1 text-[10.5px] text-muted-foreground">Within</span>
              {RADIUS_OPTIONS.map(r => (
                <button key={r} onClick={() => connect.changeRadius(r)} aria-pressed={radiusKm === r} data-testid={`radius-${r}`}
                        className={`rounded-md px-1.5 py-0.5 font-mono text-[10.5px] ${radiusKm === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                  {r}
                </button>
              ))}
              <span className="ml-0.5 text-[10.5px] text-muted-foreground">km</span>
            </div>
            {assessment.status === "loading" && !a && <Skeleton lines={4} />}
            {assessment.status === "error" && <Problem>{assessment.message}</Problem>}
            {a && (
              <div className={assessment.status === "loading" ? "opacity-60" : ""}>
                {rs && (
                  rs.empty ? (
                    <div data-testid="radius-empty" className="mb-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2">
                      <p className="text-[11.5px] font-semibold text-foreground">{rs.message}</p>
                      <p className="mt-0.5 text-[10.5px] leading-snug text-foreground/80">
                        Based on the network data this looks like an apparent infrastructure gap at this radius — worth investigating, not a conclusion.
                        {rs.nearest_substation_km != null && ` The nearest substation of any kind is ${rs.nearest_substation_km} km away.`}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {nextRadius && <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => connect.changeRadius(nextRadius)}><ArrowsOut className="h-3.5 w-3.5" /> Expand to {nextRadius} km</Button>}
                        <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={connect.showRegion}><MapPin className="h-3.5 w-3.5" /> Show the wider region</Button>
                      </div>
                    </div>
                  ) : <p data-testid="radius-summary" className="mb-1.5 text-[10.5px] text-muted-foreground">{rs.message}</p>
                )}
                {customer.state && (
                  <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={preferState} onChange={connect.togglePreferState} className="accent-[hsl(var(--primary))]" />
                    Prefer infrastructure in <span className="font-semibold text-foreground">{customer.state}</span>
                  </label>
                )}
                {a.scope_state && outScope.length > 0 && inScope.length > 0 && <p className="px-2 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">In {a.scope_state}</p>}
                <ol className="space-y-0.5">{inScope.map((c, i) => candRow(c, i))}</ol>
                {outScope.length > 0 && (
                  <>
                    <p className="px-2 pb-0.5 pt-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Across the state boundary</p>
                    <ol className="space-y-0.5">{outScope.map((c, i) => candRow(c, inScope.length + i))}</ol>
                  </>
                )}
                {a.nearby_lines?.length > 0 && (
                  <div className="mt-2.5">
                    <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Transmission lines nearby</p>
                    <ul className="space-y-0.5">
                      {a.nearby_lines.slice(0, 5).map(l => {
                        const on = focusedLine && lineKey(focusedLine) === lineKey(l);
                        return (
                          <li key={lineKey(l)}>
                            <button onClick={() => connect.focusLine(on ? null : l)} aria-pressed={on} data-testid="nearby-line"
                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left ${on ? "ring-1 ring-primary/50" : "hover:bg-accent/60"}`}>
                              <span className="h-0.5 w-4 flex-shrink-0 rounded" style={{ background: LINE_STATUS_COLOR[l.status] }} />
                              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{l.from_node} – {l.to_node}</span>
                              <Chip tone={l.status === "existing" ? "sky" : "violet"}>{statusLabel(l.status)}</Chip>
                              {l.crosses_state && <Chip tone="amber">Cross-state</Chip>}
                              <span className="flex-shrink-0 font-mono text-[11px] text-foreground">{l.distance_km}<span className="text-[9px] text-muted-foreground"> km</span></span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {focusedLine && <LineDetail l={focusedLine} onClose={() => connect.focusLine(null)} />}
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {/* 3 · Connection */}
        {cand && (
          <Section icon={Path} title="3 · Potential connection" delay={0.06}>
            <div className="mb-1 flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-2" data-testid="connection-summary">
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-foreground">{cand.name}</span>
              <span className="flex flex-shrink-0 items-center gap-1 font-mono text-[12px] font-bold text-primary">
                <span className="h-px w-4 bg-primary" />{cand.distance_km} km<ArrowRight className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-[11.5px] font-semibold text-foreground">{label || customer.name || "Customer"}</span>
            </div>
            <p className="mb-2 text-[10px] text-muted-foreground">A potential connection for assessment — not a confirmed engineering route.</p>
            {(!connect.view.connection || !connect.view.substations) && (
              <p data-testid="hidden-layer-note" className="mb-2 flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[10.5px] text-muted-foreground">
                <EyeSlash className="h-3 w-3" />
                {!connect.view.connection && !connect.view.substations ? "The connection and substations are" : !connect.view.connection ? "The connection is" : "Substations are"} hidden on the map — the figures here still apply.
                <button className="ml-auto font-semibold text-primary hover:underline" onClick={() => { if (!connect.view.connection) connect.toggleLayer("connection"); if (!connect.view.substations) connect.toggleLayer("substations"); }}>Show</button>
              </p>
            )}
            <Row k="Straight-line distance">{cand.distance_km} km{line && <span className="text-muted-foreground"> · heading {compass(line.bearing_deg)} ({line.bearing_deg}°)</span>}</Row>
            <Row k="Road distance">{line?.road_km != null ? `${line.road_km} km` : <span className="text-muted-foreground">{line ? "needs the road-routing service" : "…"}</span>}</Row>
            <Row k="Infrastructure">{kvLabel(cand.voltage_kv)}</Row>
            <Row k="Status">{cand.status === "existing" ? "Existing" : cand.status === "ongoing" ? "On-going (not yet in service)" : "Proposed (not built)"}</Row>
            <Row k="Grid supply point">{cand.supply_point ? "Yes" : cand.status !== "existing" ? "Not yet" : "No — not a customer supply point in the data"}</Row>
            <Row k="State · LGA">{[cand.state, cand.lga].filter(Boolean).join(" · ") || "—"}</Row>
            <Row k="Coordinates"><span className="font-mono">{cand.lat.toFixed(5)}, {cand.lon.toFixed(5)}</span></Row>
            <Row k="Built lines">
              {cand.lines.length ? cand.lines.map(l => `${l.to} (${l.km} km${l.to_state && l.to_state !== cand.state ? `, ${l.to_state}` : ""})`).join(" · ") : <span className="text-muted-foreground">None — not connected to the built grid</span>}
            </Row>
          </Section>
        )}

        {/* 4 · Assessment */}
        {a && (
          <Section icon={WarningCircle} title="4 · Initial indication" delay={0.09}>
            <div className={`rounded-lg border px-3 py-2.5 ${level.cls}`} data-testid="indication">
              <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: level.dot }} />{a.assessment.title}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-foreground/90">{a.assessment.summary}</p>
            </div>
            {cand && a.recommended && cand.name !== a.recommended && (
              <p className="mt-2 text-[10.5px] text-muted-foreground">This indication is for the suggested supply point, {a.recommended}; you're viewing {cand.name}.</p>
            )}
            <ul className="mt-2 space-y-1">
              {a.assessment.considerations.map(c => (
                <li key={c} className="flex gap-1.5 text-[10.5px] leading-snug text-muted-foreground"><span className="text-primary">•</span>{c}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1">
              {a.assessment.bands.map(b => (
                <span key={b.level} className={`rounded px-1.5 py-0.5 text-[9px] ${b.level === a.assessment.level ? "bg-foreground/10 font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {b.title} {b.max_km ? `≤${b.max_km} km` : ">75 km"}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[9.5px] leading-snug text-muted-foreground/80">{a.assessment.disclaimer}</p>
          </Section>
        )}
      </div>

      {customer && (
        <div className="flex items-center gap-1.5 border-t border-border px-3 py-2.5">
          <Button size="sm" className="flex-1" onClick={onSources}><Lightning className="h-3.5 w-3.5" /> GenCo sources</Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={onRoute}><Path className="h-3.5 w-3.5" /> Route power here</Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="secondary" className="h-8 w-8" onClick={onPin} aria-label="Pin this customer"><PushPin className="h-3.5 w-3.5" /></Button>
            </TooltipTrigger>
            <TooltipContent>Pin this customer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="secondary" className="h-8 w-8" onClick={copy} aria-label="Copy connection summary">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? "Copied" : "Copy summary"}</TooltipContent>
          </Tooltip>
        </div>
      )}
    </motion.aside>
  );
}
