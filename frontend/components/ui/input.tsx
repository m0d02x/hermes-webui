import * as React from "react"

import { cn } from "@/lib/cn"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "lib-flex lib-h-9 lib-w-full lib-rounded-md lib-border lib-border-input lib-bg-transparent lib-px-3 lib-py-1 lib-text-base lib-shadow-sm lib-transition-colors file:lib-border-0 file:lib-bg-transparent file:lib-text-sm file:lib-font-medium file:lib-text-foreground placeholder:lib-text-muted-foreground focus-visible:lib-outline-none focus-visible:lib-ring-1 focus-visible:lib-ring-ring disabled:lib-cursor-not-allowed disabled:lib-opacity-50 md:lib-text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
