import { motion } from "motion/react";
import { X, Lightning, Users, CaretRight } from "@phosphor-icons/react";
import { Section, Problem } from "./cardParts";
import { NEAR_KM } from "./substationCustomers";

// The reverse of a site scan: a substation and the customers nearest to it.
// Tapping a customer scans their site, connected at this substation.

const KIND = { offtaker: "Onction offtaker", ci: "C&I anchor load" };

export default function SubstationCard({ focus, onClose, onScanCustomer }) {
  const { sub, connected, listed, near } = focus;
  const hereCount = near.rows.filter(r => r.nearestHere).length;
  return (
    <motion.aside
      data-testid="substation-card"
      initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute left-3 right-3 bottom-3 top-auto z-[26] flex max-h-[55%] flex-col overflow-hidden rounded-xl border border-border shadow-2xl backdrop-blur-md
                 sm:right-auto sm:bottom-auto sm:top-[68px] sm:w-[340px] sm:max-h-[calc(100%-7.5rem)]"
      style={{ background: "color-mix(in srgb, hsl(var(--card)) 94%, transparent)" }}
      aria-label={`Substation ${sub.name}`}
    >
      <div className="relative px-4 pb-3 pt-3.5">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
            <Lightning className="h-4 w-4" weight="bold" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-sky-400">Substation</p>
            <p className="truncate text-sm font-semibold text-foreground">{sub.name}</p>
            <p className="text-[10.5px] text-muted-foreground">
              {sub.voltage_kv} kV · {sub.status}{sub.state ? ` · ${sub.state}` : ""}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close substation" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className={`rounded-full border px-1.5 text-[9px] font-semibold ${listed && connected ? "border-emerald-500/40 text-emerald-500" : "border-amber-500/40 text-amber-500"}`}>
            {listed && connected ? "Listed supply point" : "Not confirmed as a supply point"}
          </span>
          <span className={`rounded-full border px-1.5 text-[9px] font-semibold ${connected ? "border-border text-muted-foreground" : "border-red-400/40 text-red-400"}`}>
            {connected ? "On the built grid" : "Not on the built grid"}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section icon={Users} title={near.beyond ? "Nearest customers" : `Customers within ${NEAR_KM} km`} source="onction">
          {near.beyond && <Problem>No customers within {NEAR_KM} km. These are the nearest ones.</Problem>}
          {!near.beyond && (
            <p className="mb-2 text-[10.5px] text-muted-foreground">
              {near.total} customer{near.total === 1 ? "" : "s"} nearby; this is the nearest built substation for {hereCount} of {near.rows.length} shown.
            </p>
          )}
          <ul className="space-y-1" data-testid="substation-customers">
            {near.rows.map(c => (
              <li key={`${c.kind}-${c.name}`}>
                <button type="button" onClick={() => onScanCustomer(c)}
                        className="group flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-accent">
                  <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${c.nearestHere ? "bg-sky-400" : "border border-sky-400"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-foreground">{c.name}</span>
                      <span className="ml-auto flex-shrink-0 font-mono text-[10.5px] text-foreground">{c.km} km</span>
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">{KIND[c.kind]}{c.sub ? ` · ${c.sub}` : ""}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {c.nearestHere ? "This is its nearest built substation." : c.nearest ? `Nearer: ${c.nearest.name} (${c.nearest.km} km)` : ""}
                      {!c.nearestHere && c.nearest && (c.autoSupply?.name === c.nearest.name ? ", also its auto-picked supply point." : ".")}
                      {c.autoSupply && c.autoSupply.name !== sub.name && c.autoSupply.name !== c.nearest?.name && ` Auto-picked supply point: ${c.autoSupply.name}.`}
                    </span>
                  </span>
                  <CaretRight className="mt-1 h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[9.5px] leading-snug text-muted-foreground/80">
            Straight-line distances. Tap a customer to scan their site{connected ? ` connected at ${sub.name}` : ""}.
            Customers are Onction offtakers and C&amp;I anchor loads in the app's data.
          </p>
        </Section>
      </div>
    </motion.aside>
  );
}
