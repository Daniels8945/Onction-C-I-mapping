import { motion } from "motion/react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export default function LayerRow({ colorDot, label, badge, on, onClick, hint }) {
  const row = (
    <motion.div
      role="button"
      tabIndex={0}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-accent/60"
    >
      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: colorDot }} />
      <span className="flex-1 text-xs text-foreground/90 truncate">{label}</span>
      {badge != null && <Badge variant="outline">{badge}</Badge>}
      <Switch checked={on} onCheckedChange={() => {}} />
    </motion.div>
  );

  if (!hint) return row;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px] font-normal">{hint}</TooltipContent>
    </Tooltip>
  );
}
