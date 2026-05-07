import * as React from "react";
import { CornerDownLeft } from "lucide-react";

import { cn } from "@/lib/utils";

const PromptInput = React.forwardRef<
  HTMLFormElement,
  React.ComponentProps<"form">
>(({ className, ...props }, ref) => {
  return (
    <form
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/70 bg-card/70 shadow-lg shadow-black/20 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-foreground/20 before:to-transparent before:content-['']",
        className,
      )}
      {...props}
    />
  );
});
PromptInput.displayName = "PromptInput";

const PromptInputHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-wrap items-start gap-3 border-b border-border/60 px-3 py-3",
        className,
      )}
      {...props}
    />
  );
});
PromptInputHeader.displayName = "PromptInputHeader";

const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[56px] w-full resize-none bg-transparent px-3 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/90 disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-[120px]",
        className,
      )}
      {...props}
    />
  );
});
PromptInputTextarea.displayName = "PromptInputTextarea";

const PromptInputFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-2 border-t border-border/60 px-3 py-2 sm:flex-row sm:items-end sm:justify-between sm:py-3",
        className,
      )}
      {...props}
    />
  );
});
PromptInputFooter.displayName = "PromptInputFooter";

const PromptInputTools = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
});
PromptInputTools.displayName = "PromptInputTools";

const PromptInputActions = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex items-center gap-2 sm:justify-end", className)}
      {...props}
    />
  );
});
PromptInputActions.displayName = "PromptInputActions";

function PromptInputMeta({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "hidden flex-wrap items-center gap-2 text-xs text-muted-foreground sm:flex",
        className,
      )}
      {...props}
    />
  );
}

function PromptInputEnterHint({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} {...props}>
      <CornerDownLeft className="size-3" aria-hidden="true" />
      Enter to send
    </span>
  );
}

export {
  PromptInput,
  PromptInputActions,
  PromptInputEnterHint,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputMeta,
  PromptInputTextarea,
  PromptInputTools,
};
