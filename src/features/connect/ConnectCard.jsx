import { useState } from "react";
import { motion } from "motion/react";
import { Plug, X, MapPin, ArrowRight, Lightning, Path, Copy, Check, PushPin, WarningCircle, Info } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Section, Skeleton, Problem } from "@/features/explore/cardParts";
import { ConfidenceBadge } from "./CustomerSearch";
import { STATUS_COLOR } from "./useConnect";

// Connect a customer: where they are → what infrastructure is near → the
// connection → an initial planning indication. Shows only what the dataset
// holds; nothing here is an engineering decision.

const LEVEL = {
  near:      { cls: "border-emerald-500/40 bg-emerald-500/10", dot: "#10b981" },
  moderate:  { cls: "border-amber-500/40 bg-amber-500/10",     dot: "#f5a623" },
  extension: { cls: "border-orange-500/40 bg-orange-500/10",   dot: "#f97316" },
  gap:       { cls: "border-red-500/40 bg-red-500/10",         dot: "#ef4444" },
};
const compass = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
const kvLabel = (kv) => (kv >= 330 ? "330/132 kV bulk substation" : kv >= 132 ? "132/33 kV substation" : `${kv} kV substation`);

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

export function connectSummaryText({ customer, label, assessment, selected, line }) {
  const a = assessment.data;
  const cand = a?.candidates.find(c => c.name === selected);
  const lines = [`Onction connection check — ${label || customer.name}`];
  lines.push(`Location: ${[customer.address, customer.lga, customer.state].filter(Boolean).join(", ")} (${customer.lat.toFixed(5)}, ${customer.lng.toFixed(5)})`);
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

export default function ConnectCard({ connect, onClose, onSources, onRoute, onPin }) {
  const [copied, setCopied] = useState(false);
  const { customer, label, assessment, selected, line, preferState } = connect;
  const a = assessment.data;
  const cand = a?.candidates.find(c => c.name === selected);
  const level = a ? LEVEL[a.assessment.level] : null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(connectSummaryText(connect)); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
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
        <button onClick={onClose} aria-label="Close connection check" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!customer && (
          <p className="border-t border-border px-4 py-5 text-[11.5px] leading-relaxed text-muted-foreground">
            {connect.dropping ? "Click the customer's location on the map." : "Search for the customer above, or drop a pin."}
          </p>
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
              <ConfidenceBadge confidence={customer.confidence} precision={customer.precision} />
              <span className="font-mono text-[10px] text-muted-foreground">{customer.lat.toFixed(5)}, {customer.lng.toFixed(5)}</span>
            </div>
            {customer.confidence_reason && <p className="mt-1 text-[10.5px] text-muted-foreground">{customer.confidence_reason}</p>}
            <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-primary/90">
              <Info className="h-3 w-3" /> Drag the pin on the map to the exact site — everything below updates.
            </p>
          </Section>
        )}

        {/* 2 · Nearby infrastructure */}
        {customer && (
          <Section icon={Plug} title="2 · Nearby infrastructure" source={a ? "live" : null} delay={0.03}>
            {assessment.status === "loading" && !a && <Skeleton lines={4} />}
            {assessment.status === "error" && <Problem>{assessment.message}</Problem>}
            {a && (
              <>
                {customer.state && (
                  <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={preferState} onChange={connect.togglePreferState} className="accent-[hsl(var(--primary))]" />
                    Prefer infrastructure in <span className="font-semibold text-foreground">{customer.state}</span>
                  </label>
                )}
                <ol className={`space-y-0.5 ${assessment.status === "loading" ? "opacity-60" : ""}`}>
                  {a.candidates.map((c, i) => {
                    const sel = c.name === selected;
                    return (
                      <li key={c.name}>
                        <button
                          onClick={() => connect.select(c.name)} aria-pressed={sel}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${sel ? "bg-primary/12 ring-1 ring-primary/50" : "hover:bg-accent/60"}`}
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
                            </span>
                          </span>
                          <span className="flex-shrink-0 font-mono text-[12px] font-semibold text-foreground">{c.distance_km}<span className="text-[9.5px] text-muted-foreground"> km</span></span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                {a.nearest_line && (
                  <p className="mt-2 text-[10.5px] text-muted-foreground">
                    Nearest built transmission line: <span className="text-foreground">{a.nearest_line.from_node} – {a.nearest_line.to_node}</span>, ~{a.nearest_line.distance_km} km away.
                  </p>
                )}
              </>
            )}
          </Section>
        )}

        {/* 3 · Connection */}
        {cand && (
          <Section icon={Path} title="3 · Potential connection" delay={0.06}>
            <div className="mb-2 flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-2">
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-foreground">{label || customer.name || "Customer"}</span>
              <span className="flex flex-shrink-0 items-center gap-1 font-mono text-[12px] font-bold text-primary">
                <span className="h-px w-4 bg-primary" />{cand.distance_km} km<ArrowRight className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-[11.5px] font-semibold text-foreground">{cand.name}</span>
            </div>
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
            <div className={`rounded-lg border px-3 py-2.5 ${level.cls}`}>
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
