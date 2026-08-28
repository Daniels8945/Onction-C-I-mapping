import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:     "bg-primary text-primary-foreground font-bold hover:opacity-90",
        secondary:   "bg-secondary text-secondary-foreground border border-border hover:bg-accent",
        outline:     "border border-border bg-transparent text-foreground hover:bg-accent",
        ghost:       "text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        link:        "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        sm:      "h-7 px-2.5",
        lg:      "h-9 px-4",
        icon:    "h-8 w-8 shrink-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
