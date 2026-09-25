import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/cn"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "lib-fixed lib-inset-0 lib-z-[10000] lib-bg-black/80 data-[state=open]:lib-animate-in data-[state=closed]:lib-animate-out data-[state=closed]:lib-fade-out-0 data-[state=open]:lib-fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <div className="lib-scope">
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "lib-fixed lib-left-[50%] lib-top-[50%] lib-z-[10001] lib-grid lib-w-[calc(100vw-2rem)] lib-max-w-lg lib-translate-x-[-50%] lib-translate-y-[-50%] lib-gap-4 lib-border lib-bg-background lib-p-6 lib-shadow-lg lib-duration-200 data-[state=open]:lib-animate-in data-[state=closed]:lib-animate-out data-[state=closed]:lib-fade-out-0 data-[state=open]:lib-fade-in-0 data-[state=closed]:lib-zoom-out-95 data-[state=open]:lib-zoom-in-95 data-[state=closed]:lib-slide-out-to-left-1/2 data-[state=closed]:lib-slide-out-to-top-[48%] data-[state=open]:lib-slide-in-from-left-1/2 data-[state=open]:lib-slide-in-from-top-[48%] sm:lib-rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="lib-absolute lib-right-2 lib-top-2 lib-flex lib-size-11 lib-items-center lib-justify-center lib-rounded-sm lib-opacity-70 lib-ring-offset-background lib-transition-opacity hover:lib-opacity-100 focus:lib-outline-none focus:lib-ring-2 focus:lib-ring-ring focus:lib-ring-offset-2 disabled:lib-pointer-events-none data-[state=open]:lib-bg-accent data-[state=open]:lib-text-muted-foreground">
        <X className="lib-h-4 lib-w-4" />
        <span className="lib-sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
    </div>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "lib-flex lib-flex-col lib-space-y-1.5 lib-text-center sm:lib-text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "lib-flex lib-flex-col-reverse sm:lib-flex-row sm:lib-justify-end sm:lib-space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "lib-text-lg lib-font-semibold lib-leading-none lib-tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("lib-text-sm lib-text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
