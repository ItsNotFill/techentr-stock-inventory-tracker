import * as React from "react"
import { cn } from "cn"

// 44 px high with 16 px text on a phone (no zoom on focus), 40 px and 14 px from `md` up.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-1 text-base text-foreground shadow-xs transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-placeholder hover:border-foreground/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 read-only:bg-muted md:h-10 md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { Input }
