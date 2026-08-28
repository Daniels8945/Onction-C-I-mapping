import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Info } from "@phosphor-icons/react";

export default function SectionTitle({ children, hint }) {
  return (
    <div className="flex items-center gap-1 px-3 pt-4 pb-1.5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{children}</p>
      {hint && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground">
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[220px] normal-case tracking-normal font-normal">{hint}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
