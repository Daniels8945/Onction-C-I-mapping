import { AnimatePresence, motion } from "motion/react";
import { CaretLeft, CaretRight, MapPin, Trash, X } from "@phosphor-icons/react";
import LayerRow    from "./ui/LayerRow";
import SectionTitle from "./ui/SectionTitle";
import GridCalculator from "./GridCalculator";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { CI_CUSTOMERS, GENCOS, TRADERS, DISCOS } from "../data";

export default function Sidebar({
  layerVis, toggleLayer,
  selectedFeature, analysisText,
  pins, onFlyToPin, onRemovePin, onClearPins,
  isCollapsed, onToggleCollapse,
  gridStatus, gridError, gridParties, gridLossModels, gridAtccScenarios,
  gridRouteResult, gridBestSource, gridPresetGenco, gridPresetDest, gridNearby,
  onComputeGridRoute, onComputeGridBestSource, onClearGridRoute, onApplyCustomRoute,
}) {
  return (
    <>
      {/* Collapse toggle tab — always visible */}
      <Button
        variant="secondary"
        size="icon"
        onClick={onToggleCollapse}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`
          absolute top-1/2 -translate-y-1/2 z-30
          h-14 w-5 rounded-l-none rounded-r-md border-l-0 shadow-md
          transition-all duration-300
          ${isCollapsed ? "left-0" : "left-[260px]"}
        `}
      >
        {isCollapsed ? <CaretRight className="h-3.5 w-3.5" /> : <CaretLeft className="h-3.5 w-3.5" />}
      </Button>

      {/* Sidebar panel */}
      <div
        className={`
          relative flex flex-col bg-card border-r border-border
          overflow-hidden flex-shrink-0 transition-all duration-300
          ${isCollapsed ? "w-0" : "w-[260px]"}
        `}
      >
        <ScrollArea className="w-[260px] h-full">
          <div className="flex flex-col pb-4">

            {/* C&I Layer */}
            <SectionTitle hint="Commercial & Industrial customers — large factories, banks, mills etc. that buy power directly under their own contract instead of through the standard grid tariff.">
              C&amp;I Customers
            </SectionTitle>
            <LayerRow
              colorDot="#7c6af8" label="C&I Anchor Loads" badge={CI_CUSTOMERS.length} on={layerVis.ci} onClick={() => toggleLayer("ci")}
              hint="60 large commercial & industrial sites across Nigeria that buy electricity directly rather than through their local DisCo."
            />

            {/* Reference Layers */}
            <SectionTitle hint="A broad, general reference view of Nigeria's power market participants — independent of any specific Onction deal.">
              Reference Layers
            </SectionTitle>
            <LayerRow
              colorDot="#f5a623" label="DISCO HQs" badge={DISCOS.length} on={layerVis.discos} onClick={() => toggleLayer("discos")}
              hint="Headquarters of Nigeria's 12 licensed Distribution Companies — the utilities that deliver power to homes and businesses in their territory."
            />
            <LayerRow
              colorDot="#00e5a0" label="GenCo / NIPP / IPP" badge={GENCOS.length} on={layerVis.gencos} onClick={() => toggleLayer("gencos")}
              hint="Power plants: GenCo (privatized former state generator), NIPP (government-built National Integrated Power Project plant), or IPP (privately owned Independent Power Producer)."
            />
            <LayerRow
              colorDot="#f5a623" label="Electricity Traders" badge={TRADERS.length} on={layerVis.traders} onClick={() => toggleLayer("traders")}
              hint="NERC-licensed bulk electricity trading companies that buy from generators and resell to DisCos or eligible customers."
            />

            <Separator className="my-2" />

            {/* Onction Grid Atlas — live network + PPA parties from the routing API */}
            <SectionTitle hint="Onction's own live data: the actual TCN transmission network, plus Onction's specific GenCo/DisCo/Offtaker deals layered on top of it — sourced from real PPAs, not the generic market list above.">
              Onction Grid Atlas
            </SectionTitle>
            <div className="mx-3 mb-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[10px] text-muted-foreground leading-relaxed">
              Turn on a layer below to see it on the map. Click any <span className="text-[hsl(var(--data-genco))] font-semibold">GenCo</span>,{" "}
              <span className="text-[hsl(var(--data-disco))] font-semibold">DisCo</span>, or{" "}
              <span className="text-[hsl(var(--data-offtaker))] font-semibold">Offtaker</span> marker to load it straight into the calculator below —
              or pick both manually and hit <span className="text-foreground font-semibold">Route</span>.
            </div>
            <LayerRow
              colorDot="hsl(215 20% 55%)" label="TCN Substations" badge={null} on={layerVis.gridSubstations} onClick={() => toggleLayer("gridSubstations")}
              hint="The physical 330kV/132kV nodes of the national grid, operated by TCN (Transmission Company of Nigeria)."
            />
            <LayerRow
              colorDot="hsl(215 20% 40%)" label="Grid Corridors" badge={null} on={layerVis.gridEdges} onClick={() => toggleLayer("gridEdges")}
              hint="The transmission line segments connecting substations — the physical wires power travels along."
            />
            <LayerRow
              colorDot="hsl(var(--data-genco))" label="GenCo Engagements" badge={gridParties.gencos.length} on={layerVis.gridGencos} onClick={() => toggleLayer("gridGencos")}
              hint="Onction's live commercial deals with generators, sourced from executed and draft PPAs."
            />
            <LayerRow
              colorDot="hsl(var(--data-disco))" label="DisCo Engagements" badge={gridParties.discos.length} on={layerVis.gridDiscos} onClick={() => toggleLayer("gridDiscos")}
              hint="Onction's live supply deals with distribution companies, same PPA-backed source."
            />
            <LayerRow
              colorDot="hsl(var(--data-offtaker))" label="Offtakers" badge={gridParties.offtakers.length} on={layerVis.gridOfftakers} onClick={() => toggleLayer("gridOfftakers")}
              hint="Onction's contracted end customers — eligible buyers taking power under an Onction-brokered deal."
            />

            <SectionTitle hint="Pick a source GenCo and a destination — get the actual grid path, distance, and estimated transmission loss between them.">
              Route &amp; Loss Calculator
            </SectionTitle>
            <div className="px-3">
              <GridCalculator
                gridStatus={gridStatus} gridError={gridError} gridParties={gridParties}
                gridLossModels={gridLossModels} gridAtccScenarios={gridAtccScenarios}
                gridRouteResult={gridRouteResult} gridBestSource={gridBestSource}
                presetGenco={gridPresetGenco} presetDest={gridPresetDest}
                pins={pins}
                onComputeRoute={onComputeGridRoute} onComputeBestSource={onComputeGridBestSource}
                onClear={onClearGridRoute} onApplyCustomRoute={onApplyCustomRoute}
              />
            </div>

            {/* Selected Feature */}
            <AnimatePresence>
              {selectedFeature && (
                <motion.div
                  key={selectedFeature.name}
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <SectionTitle hint="Details for whatever marker you last clicked on the map.">Selected Feature</SectionTitle>
                  <div className="px-3">
                    <Card>
                      <CardContent className="pt-3">
                        <p className="text-xs font-bold text-primary truncate">{selectedFeature.name}</p>
                        <p className="text-[9px] text-muted-foreground mb-2">{selectedFeature.type}</p>
                        {selectedFeature.rows.map(([k, v], i) => (
                          <div key={i} className="flex justify-between text-[10px] py-1 border-t border-border gap-2">
                            <span className="text-muted-foreground flex-shrink-0">{k}</span>
                            <span className="text-foreground text-right break-words max-w-[150px]">{v}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Nearest Offtakers (clicked a GenCo) / Nearest GenCos (clicked an Offtaker) —
                read straight off the precomputed route table, ranked by total distance. */}
            <AnimatePresence>
              {gridNearby && gridNearby.items.length > 0 && (
                <motion.div
                  key={`${gridNearby.sourceKind}-${gridNearby.sourceName}`}
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <SectionTitle hint="Every offtaker/GenCo on the other side of this one, ranked by grid-routed distance (nearest first) — from the precomputed route table, no extra request.">
                    {gridNearby.sourceKind === "GenCo" ? "Nearest Offtakers" : "Nearest GenCos"}
                  </SectionTitle>
                  <div className="px-3">
                    <Card>
                      <CardContent className="pt-3">
                        <p className="text-[9px] text-muted-foreground mb-1.5 truncate">to {gridNearby.sourceName}</p>
                        {gridNearby.items.map((it, i) => (
                          <button
                            key={it.name}
                            onClick={() => onComputeGridRoute(
                              gridNearby.sourceKind === "GenCo"
                                ? { genco: gridNearby.sourceName, dest: it.name }
                                : { genco: it.name, dest: gridNearby.sourceName }
                            )}
                            className={`w-full flex justify-between items-baseline gap-2 text-[10px] py-1 border-t border-border text-left transition-colors hover:text-primary ${i === 0 ? "text-primary" : "text-foreground/90"}`}
                          >
                            <span className="truncate">{i + 1}. {it.name}</span>
                            <span className="flex-shrink-0 text-muted-foreground">{it.total_km} km</span>
                          </button>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Analysis */}
            <SectionTitle>Analysis</SectionTitle>
            <div className="px-3">
              <Card>
                <CardContent
                  className="pt-3 text-[10px] text-muted-foreground leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: analysisText }}
                />
              </Card>
            </div>

            {/* Pinned Locations */}
            {pins.length > 0 && (
              <>
                <div className="flex items-center justify-between px-3 pt-4 pb-1.5">
                  <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    <MapPin className="h-3 w-3" /> Pinned ({pins.length})
                  </p>
                  <button onClick={onClearPins} className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-destructive transition-colors">
                    <Trash className="h-3 w-3" /> Clear all
                  </button>
                </div>
                <AnimatePresence initial={false}>
                  {pins.map(p => (
                    <motion.div
                      key={p.id}
                      layout
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.15 }}
                      className="group flex items-center gap-2 px-3 py-1.5 hover:bg-accent/60 transition-colors"
                    >
                      <MapPin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <button onClick={() => onFlyToPin(p)} className="flex-1 text-left text-xs text-foreground/90 truncate hover:text-primary transition-colors">{p.label}</button>
                      <button onClick={() => onRemovePin(p.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                        <X className="h-3 w-3" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
