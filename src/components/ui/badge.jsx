import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-mono font-semibold leading-none tabular-nums transition-colors",
  {
    variants: {
      variant: {
        default:   "border-transparent bg-secondary text-secondary-foreground",
        primary:   "border-transparent bg-primary/15 text-primary",
        outline:   "border-border text-muted-foreground",
        destructive: "border-transparent bg-destructive/15 text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
