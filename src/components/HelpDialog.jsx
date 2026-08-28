import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Question } from "@phosphor-icons/react";

function Swatch({ color }) {
  return <span className="mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color }} />;
}

function Entry({ color, title, children }) {
  return (
    <div className="flex gap-2.5">
      <Swatch color={color} />
      <div>
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function Term({ term, children }) {
  return (
    <div className="flex gap-2.5">
      <span className="text-xs font-mono font-semibold text-primary w-14 flex-shrink-0">{term}</span>
      <span className="text-[11px] text-muted-foreground leading-relaxed">{children}</span>
    </div>
  );
}

export default function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="What am I looking at?">
          <Question className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader>
          <DialogTitle>What am I looking at?</DialogTitle>
          <DialogDescription>
            A map of Nigeria's electricity market — who generates power, who delivers it, who buys it directly,
            and (in the Onction Grid Atlas section) the live transmission network connecting them.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-5">
            <section className="space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Market layers</p>
              <Entry color="#7c6af8" title="C&I Anchor Loads">
                Commercial &amp; Industrial customers — factories, mills, banks, hospitals — large enough to buy power
                directly under their own contract instead of through the grid's standard tariff.
              </Entry>
              <Entry color="#f5a623" title="DISCO HQs">
                Headquarters of Nigeria's 12 licensed <strong>Dis</strong>tribution <strong>Co</strong>mpanies — the
                utilities that deliver electricity to homes and businesses within their assigned territory.
              </Entry>
              <Entry color="#00e5a0" title="GenCo / NIPP / IPP">
                Power plants. <strong>GenCo</strong> = a privatized former state generating company. <strong>NIPP</strong> =
                National Integrated Power Project, a plant built and still held by the government (NDPHC).
                <strong> IPP</strong> = Independent Power Producer, a privately built and owned plant.
              </Entry>
              <Entry color="#f5a623" title="Electricity Traders">
                NERC-licensed bulk trading companies that buy power from generators and resell it onward to
                DisCos or eligible customers.
              </Entry>
            </section>

            <section className="space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Onction Grid Atlas</p>
              <Entry color="hsl(215 20% 55%)" title="TCN Substations">
                The physical 330kV/132kV nodes of the national transmission grid, operated by TCN
                (Transmission Company of Nigeria) — where power actually changes hands between the trunk
                network and a local feeder.
              </Entry>
              <Entry color="hsl(215 20% 40%)" title="Grid Corridors">
                The transmission line segments connecting those substations — the physical wires power actually
                travels along.
              </Entry>
              <Entry color="hsl(158 84% 45%)" title="GenCo Engagements">
                Onction's own live commercial deals with generators, sourced from executed and draft PPAs
                (Power Purchase Agreements) — not the generic market list above.
              </Entry>
              <Entry color="hsl(199 89% 65%)" title="DisCo Engagements">
                Onction's live supply deals with distribution companies, same PPA-backed source.
              </Entry>
              <Entry color="hsl(330 81% 74%)" title="Offtakers">
                Onction's contracted end customers — the eligible commercial/industrial buyers actually taking
                power under an Onction-brokered deal.
              </Entry>
              <p className="text-[11px] text-muted-foreground leading-relaxed pl-[22px]">
                The <strong>Route &amp; Loss Calculator</strong> picks the shortest real path across the grid
                corridors between any GenCo and any destination, then estimates transmission loss over that
                distance — this is a planning estimate (±10%), not a settlement-grade figure.
              </p>
            </section>

            <section className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Terms</p>
              <Term term="MW">Megawatt — a unit of power capacity (how much a plant/customer can draw or produce at once).</Term>
              <Term term="kWh">Kilowatt-hour — a unit of energy actually delivered over time; what you're billed for.</Term>
              <Term term="PPA">Power Purchase Agreement — the contract fixing price and volume between a generator and a buyer.</Term>
              <Term term="ToP">Take-or-Pay — a minimum volume the buyer must pay for whether or not they actually use it.</Term>
              <Term term="AT&C&C">Aggregate Technical, Commercial &amp; Collection losses — the gap between power generated and power actually paid for, combining line losses with metering/billing/collection losses.</Term>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
