import { AnimatePresence, motion } from "motion/react";
import { Lightning, Crosshair, DownloadSimple, Moon, Sun } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import HelpDialog from "@/components/HelpDialog";
import { feederTotals, formatWat } from "@/features/feeders/useFeederLive";
import { availabilityOf } from "@/features/explore/siteScan";

function KPI({ value, label, hint, dot }) {
  const body = (
    <div className="flex flex-col items-center px-3 cursor-default">
      <span className="flex items-center gap-1.5 text-sm font-mono font-bold text-primary leading-none tabular-nums">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
        {value}
      </span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</span>
    </div>
  );
  if (!hint) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent className="max-w-[240px] font-normal">{hint}</TooltipContent>
    </Tooltip>
  );
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const FEED_DOT = { live: "bg-emerald-500 animate-pulse", delayed: "bg-amber-500", snapshot: "bg-sky-500" };
const FEED_WORD = { live: "Live", delayed: "Delayed — last reading", snapshot: "Snapshot from" };

export default function Topbar({ onExplore, scanArmed, onExport, gridParties, feeder, isDark, onThemeToggle }) {
  // Decision numbers, not layer counts: how much demand Onction is serving,
  // how much generation is actually free to sell, and how the grid is doing.
  const demandMw = gridParties.offtakers.reduce((a, o) => a + (o.capacity_mw || 0), 0);
  const freeGencos = gridParties.gencos.filter(g => availabilityOf(g.commitment).key === "available").length;
  const feeders = feederTotals(feeder.data);
  const feedersOnPct = feeders.feeders ? Math.round((100 * feeders.online) / feeders.feeders) : 0;

  return (
    <div className="flex items-center gap-1 px-3 h-12 border-b border-border bg-card flex-shrink-0 z-20">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-3">
        <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-primary-foreground">
          <Lightning className="h-3.5 w-3.5" fill="currentColor" />
        </div>
        <div className="hidden sm:block">
          <p className="text-xs font-bold text-foreground leading-none">Nigeria C&amp;I GIS</p>
          <p className="text-[9px] text-muted-foreground leading-none mt-0.5">Power Intelligence Platform</p>
        </div>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* KPIs */}
      <div className="hidden md:flex items-center">
        <KPI value={gridParties.offtakers.length ? `${demandMw} MW` : "—"} label="Offtaker demand"
             hint={`Contracted capacity across Onction's ${gridParties.offtakers.length} offtakers.`} />
        <Separator orientation="vertical" className="h-5" />
        <KPI value={gridParties.gencos.length ? `${freeGencos}/${gridParties.gencos.length}` : "—"} label="GenCos free"
             hint="Onction-engaged GenCos with capacity not yet committed elsewhere." />
        <Separator orientation="vertical" className="h-5" />
        <KPI value={`${feedersOnPct}%`} label="Feeders on" dot={FEED_DOT[feeder.mode]}
             hint={`${feeders.online} of ${feeders.feeders} metered DisCo feeders supplying power (${feeders.liveMw} MW), ${feeders.shedding} shedding load with voltage present. ${FEED_WORD[feeder.mode]} ${formatWat(feeder.data.capturedAt)}.`} />
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Tools */}
      <div className="flex items-center gap-1.5 ml-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm" onClick={onExplore} data-testid="explore-button"
              className={`explore-btn gap-1.5 pl-2.5 pr-2 font-semibold shadow-[0_0_18px_hsl(var(--primary)/0.35)] ${scanArmed ? "animate-pulse" : ""}`}
            >
              <Crosshair className="h-3.5 w-3.5" weight="bold" />
              {scanArmed ? "Click the map…" : "Explore"}
              <kbd className="ml-0.5 hidden rounded bg-black/15 px-1 py-px font-mono text-[10px] font-medium sm:inline">{IS_MAC ? "⌘K" : "Ctrl K"}</kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[230px] font-normal">
            Scan any site: its grid connection, best GenCo sources, DisCo supply and nearby demand.
          </TooltipContent>
        </Tooltip>
        <Button variant="secondary" size="sm" onClick={onExport}>
          <DownloadSimple className="h-3.5 w-3.5" /> Export
        </Button>
      </div>

      <HelpDialog />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={onThemeToggle} aria-label="Toggle theme" className="ml-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isDark ? "sun" : "moon"}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center justify-center"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </motion.span>
            </AnimatePresence>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle theme</TooltipContent>
      </Tooltip>
    </div>
  );
}
