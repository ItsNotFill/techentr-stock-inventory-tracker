import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/*
 * Status colours, all dark text on a light tint (at least 6:1):
 * success = done or fine (Has recipe, Approved, Imported)
 * warning = needs someone's attention (Needs recipe, Waiting for approval, Low)
 * danger  = went wrong or was refused (Rejected)
 * info    = worth knowing, nothing to do (First count, Default, Draft suggestion)
 * neutral = no colour needed (Ignored, Draft, Undone, Archived)
 * outline = a plain label (Modifier)
 */
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a]:hover:bg-primary-hover",
        success: "border-success-border bg-success-subtle text-success",
        warning: "border-warning-border bg-warning-subtle text-warning",
        danger: "border-danger-border bg-danger-subtle text-danger",
        info: "border-info-border bg-info-subtle text-info",
        neutral: "border-neutral-border bg-neutral-subtle text-neutral",
        outline: "border-input bg-card text-foreground [a]:hover:bg-muted",
        // Older names, kept so nothing renders unstyled.
        secondary: "border-neutral-border bg-neutral-subtle text-neutral",
        destructive: "border-danger-border bg-danger-subtle text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
