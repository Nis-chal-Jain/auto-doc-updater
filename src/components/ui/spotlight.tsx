"use client";

import { cn } from "@/lib/utils";

/** Soft top glow and line — Aceternity-style hero accent (monochrome). */
export function Spotlight({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 -top-24 z-[1] h-72 overflow-hidden md:-top-32 md:h-96",
        className,
      )}
      aria-hidden
    >
      <div className="absolute left-1/2 top-0 h-px w-[min(100%,80rem)] -translate-x-1/2 bg-gradient-to-r from-transparent via-zinc-500/35 to-transparent" />
      <div className="absolute left-[12%] top-16 h-56 w-56 rounded-full bg-zinc-400/[0.07] blur-3xl md:left-[18%]" />
      <div className="absolute right-[8%] top-24 h-44 w-44 rounded-full bg-zinc-300/[0.05] blur-3xl" />
    </div>
  );
}
