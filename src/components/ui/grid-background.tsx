"use client";

import { cn } from "@/lib/utils";

/** Full-viewport grid overlay (Aceternity-style), masked for a soft vignette. */
export function GridBackground({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 -z-[5] bg-[linear-gradient(to_right,rgba(63,63,70,0.22)_1px,transparent_1px),linear-gradient(to_bottom,rgba(63,63,70,0.22)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_65%_at_50%_-10%,#000_50%,transparent)]",
        className,
      )}
      aria-hidden
    />
  );
}
