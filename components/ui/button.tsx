import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/*
 * default: the one main action (filled accent).
 * outline / secondary: other actions (white, visible border).
 * ghost: quiet actions in accent text; link: inline text links.
 * destructive: confirms something that removes data (filled red).
 * destructive-outline: starts something that removes data (red border and text).
 * Disabled buttons turn grey (not see-through), so their label stays readable.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:shadow-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        outline:
          "border-input bg-card text-foreground shadow-xs hover:border-foreground/50 hover:bg-muted aria-expanded:bg-muted disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        secondary:
          "border-input bg-card text-foreground shadow-xs hover:border-foreground/50 hover:bg-muted aria-expanded:bg-muted disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        ghost:
          "text-primary hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent disabled:text-muted-foreground",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive-hover focus-visible:outline-destructive disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        "destructive-outline":
          "border-destructive bg-card text-destructive shadow-xs hover:bg-danger-subtle focus-visible:outline-destructive disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        link: "text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary disabled:text-muted-foreground",
      },
      size: {
        // 44 px on a phone (tap target), 40 px from `md` up.
        default:
          "h-11 gap-2 px-4 md:h-10 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-md px-3 [&_svg:not([class*='size-'])]:size-4",
        // Main actions: 44 px everywhere.
        lg: "h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-11 md:size-10",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 rounded-md",
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
