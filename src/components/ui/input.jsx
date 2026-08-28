import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-8 w-full rounded-md border border-input bg-secondary px-2.5 text-xs text-foreground placeholder:text-muted-foreground",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
