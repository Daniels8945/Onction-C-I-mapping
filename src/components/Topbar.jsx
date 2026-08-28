import { AnimatePresence, motion } from "motion/react";
import { Lightning, MagnifyingGlass, DownloadSimple, Moon, Sun } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import HelpDialog from "@/components/HelpDialog";

function KPI({ value, label }) {
  return (
    <div className="flex flex-col items-center px-3">
      <span className="text-sm font-mono font-bold text-primary leading-none tabular-nums">{value}</span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</span>
    </div>
  );
}

export default function Topbar({
  mode, onModeChange, onNearestGenco, onClear, onExport,
  visibleCount, pinCount, ciCount, isDark, onThemeToggle,
}) {
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
        <KPI value={String(ciCount)}      label="C&I Sites" />
        <Separator orientation="vertical" className="h-5" />
        <KPI value={String(visibleCount)} label="Visible" />
        <Separator orientation="vertical" className="h-5" />
        <KPI value={String(pinCount)}     label="Pins" />
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Tools */}
      <div className="flex items-center gap-1.5 ml-auto">
        <Button variant={mode === "explore" ? "default" : "secondary"} size="sm" onClick={() => onModeChange("explore")}>
          <MagnifyingGlass className="h-3.5 w-3.5" /> Explore
        </Button>
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
