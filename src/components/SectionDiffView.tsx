"use client";

import { diffWordsWithSpace } from "diff";

type Props = {
  before: string;
  after: string;
};

const beforeRemoved =
  "rounded-sm bg-red-200/90 px-0.5 text-red-950 dark:bg-red-950/60 dark:text-red-100";
const afterAdded =
  "rounded-sm bg-emerald-200/90 px-0.5 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-100";

export function SectionDiffView({ before, after }: Props) {
  const parts = diffWordsWithSpace(before, after);

  return (
    <div className="grid gap-0 md:grid-cols-2">
      <div className="border-b border-zinc-100 md:border-b-0 md:border-r dark:border-zinc-800">
        <p className="bg-zinc-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-950">
          Before
          <span className="ml-2 font-normal normal-case text-red-600 dark:text-red-400">
            removed highlighted
          </span>
        </p>
        <div className="max-h-80 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
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
        <p className="bg-zinc-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-950">
          After
          <span className="ml-2 font-normal normal-case text-emerald-600 dark:text-emerald-400">
            new text highlighted
          </span>
        </p>
        <div className="max-h-80 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
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
