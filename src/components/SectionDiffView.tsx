"use client";

import { diffWordsWithSpace } from "diff";

type Props = {
  before: string;
  after: string;
};

const beforeRemoved =
  "rounded-sm bg-zinc-800/90 px-0.5 text-zinc-200 line-through decoration-zinc-500";
const afterAdded = "rounded-sm bg-zinc-600/50 px-0.5 text-zinc-50 ring-1 ring-zinc-500/40";

export function SectionDiffView({ before, after }: Props) {
  const parts = diffWordsWithSpace(before, after);

  return (
    <div className="grid gap-0 md:grid-cols-2">
      <div className="border-b border-zinc-800/90 md:border-b-0 md:border-r md:border-zinc-800/90">
        <p className="bg-black/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Before
          <span className="ml-2 font-normal normal-case tracking-normal text-zinc-400">removed</span>
        </p>
        <div className="max-h-80 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-zinc-300">
          {parts.map((part, i) => {
            if (part.added) return null;
            if (part.removed) {
              return (
                <mark key={i} className={beforeRemoved}>
                  {part.value}
                </mark>
              );
            }
            return <span key={i}>{part.value}</span>;
          })}
        </div>
      </div>
      <div>
        <p className="bg-black/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
          After
          <span className="ml-2 font-normal normal-case tracking-normal text-zinc-400">added</span>
        </p>
        <div className="max-h-80 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-zinc-300">
          {parts.map((part, i) => {
            if (part.removed) return null;
            if (part.added) {
              return (
                <mark key={i} className={afterAdded}>
                  {part.value}
                </mark>
              );
            }
            return <span key={i}>{part.value}</span>;
          })}
        </div>
      </div>
    </div>
  );
}
