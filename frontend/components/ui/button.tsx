import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/cn"

const buttonVariants = cva(
  "lib-inline-flex lib-items-center lib-justify-center lib-gap-2 lib-whitespace-nowrap lib-rounded-md lib-text-sm lib-font-medium lib-transition-colors focus-visible:lib-outline-none focus-visible:lib-ring-1 focus-visible:lib-ring-ring disabled:lib-pointer-events-none disabled:lib-opacity-50 [&_svg]:lib-pointer-events-none [&_svg]:lib-size-4 [&_svg]:lib-shrink-0",
  {
    variants: {
      variant: {
        default:
          "lib-bg-primary lib-text-primary-foreground lib-shadow hover:lib-bg-primary/90",
        destructive:
          "lib-bg-destructive lib-text-destructive-foreground lib-shadow-sm hover:lib-bg-destructive/90",
        outline:
          "lib-border lib-border-input lib-bg-background lib-shadow-sm hover:lib-bg-accent hover:lib-text-accent-foreground",
        secondary:
          "lib-bg-secondary lib-text-secondary-foreground lib-shadow-sm hover:lib-bg-secondary/80",
        ghost: "hover:lib-bg-accent hover:lib-text-accent-foreground",
        link: "lib-text-primary lib-underline-offset-4 hover:lib-underline",
      },
      size: {
        default: "lib-h-9 lib-px-4 lib-py-2",
        sm: "lib-h-8 lib-rounded-md lib-px-3 lib-text-xs",
        lg: "lib-h-10 lib-rounded-md lib-px-8",
        icon: "lib-h-9 lib-w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
