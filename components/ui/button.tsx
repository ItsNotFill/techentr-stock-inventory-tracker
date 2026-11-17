import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/*
 * default: the page's one main action (filled green).
 * outline / secondary: every other action (white, border, dark text).
 * destructive (filled red): only the final confirm button inside a confirm
 *   dialog, the one that really removes or throws away data.
 * destructive-outline (white, red border and text, light red on hover): every
 *   button that opens such a dialog, and every per-row remove/delete in a list
 *   or table. A row of filled red buttons shouts; the fill is kept for the
 *   last, deliberate click. Red #A32D2D: 7.1:1 on white; hover red #8A2525 on
 *   the light red #FCEBEB: 7.7:1 (#A32D2D on it would still be 6.1:1).
 * ghost: icon-only buttons (close a dialog, drop an unsaved line from an editor).
 * link: a text action inside a sentence.
 * At least 44 px high on a phone and 40 px from `md` up. Disabled buttons turn
 * grey instead of see-through, so the label stays readable.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        outline:
          "border-border bg-secondary text-secondary-foreground hover:border-muted-foreground/50 hover:bg-row-hover aria-expanded:bg-row-hover disabled:bg-muted disabled:text-muted-foreground",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:border-muted-foreground/50 hover:bg-row-hover aria-expanded:bg-row-hover disabled:bg-muted disabled:text-muted-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover focus-visible:outline-destructive disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        "destructive-outline":
          "border-destructive bg-card text-destructive hover:border-destructive-hover hover:bg-danger hover:text-destructive-hover focus-visible:outline-destructive aria-expanded:bg-danger disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        ghost:
          "text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted disabled:text-muted-foreground",
        link: "text-primary underline decoration-primary/40 underline-offset-4 hover:text-primary-hover hover:decoration-primary-hover disabled:text-muted-foreground",
      },
      size: {
        default:
          "h-11 gap-2 px-4 md:h-10 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-11 gap-1.5 px-2.5 text-xs md:h-10",
        sm: "h-11 gap-1.5 px-3 md:h-10",
        // Main actions: 44 px everywhere.
        lg: "h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-11 md:size-10",
        "icon-xs": "size-11 md:size-10",
        "icon-sm": "size-11 md:size-10",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
