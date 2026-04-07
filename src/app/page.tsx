"use client";

import { useCallback, useMemo, useState } from "react";

type ReadmeSection = {
  id: string;
  headingLine: string;
  title: string;
  level: number;
  markdown: string;
};

type LlmSectionProposal = {
  sectionId: string;
  affected: boolean;
  proposedMarkdown?: string;
  rationale?: string;
};

type AnalyzeResponse = {
  repo: { owner: string; repo: string };
  pr: { number: number; title: string; headRef: string };
  readmePath: string;
  readmeFull: string;
  sections: ReadmeSection[];
  diffPreview: string;
  filesChanged: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
  }[];
  llm: {
    summary: string;
    proposals: LlmSectionProposal[];
  };
};

function mergeReadme(
  sections: ReadmeSection[],
  proposalsById: Map<string, LlmSectionProposal>,
  accepted: Record<string, boolean>
): string {
  return sections
    .map((s) => {
      const p = proposalsById.get(s.id);
      if (p?.affected && p.proposedMarkdown && accepted[s.id] !== false) {
        return p.proposedMarkdown;
      }
      return s.markdown;
    })
    .filter((m) => m.length > 0)
    .join("\n\n");
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  const proposalsById = useMemo(() => {
    const m = new Map<string, LlmSectionProposal>();
    if (!data) return m;
    for (const p of data.llm.proposals) {
      m.set(p.sectionId, p);
    }
    return m;
  }, [data]);

  const affectedSectionIds = useMemo(() => {
    if (!data) return [];
    return data.llm.proposals
      .filter((p) => p.affected && p.proposedMarkdown)
      .map((p) => p.sectionId);
  }, [data]);

  const mergedReadme = useMemo(() => {
    if (!data) return "";
    return mergeReadme(data.sections, proposalsById, accepted);
  }, [data, proposalsById, accepted]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setData(null);
      setLoading(true);
      setAccepted({});
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoUrl,
            prNumber: Number(prNumber),
          }),
        });
        const json = (await res.json()) as AnalyzeResponse & { error?: string };
        if (!res.ok) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }
        const initial: Record<string, boolean> = {};
        for (const p of json.llm.proposals) {
          if (p.affected && p.proposedMarkdown) {
            initial[p.sectionId] = true;
          }
        }
        setAccepted(initial);
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [repoUrl, prNumber]
  );

  const toggleSection = (id: string) => {
    setAccepted((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyMerged = async () => {
    try {
      await navigator.clipboard.writeText(mergedReadme);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-10">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Doc sync
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            README updates from a pull request
          </h1>
          <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400">
            Enter a public GitHub repository URL and a PR number. The app fetches
            the PR diff and your README on the PR branch, asks a model which
            sections are stale, and lets you accept or reject each rewrite before
            copying the merged file.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label
                htmlFor="repo"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Repository URL
              </label>
              <input
                id="repo"
                type="url"
                required
                placeholder="https://github.com/vercel/next.js"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/20 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
            <div className="sm:w-32">
              <label
                htmlFor="pr"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                PR #
              </label>
              <input
                id="pr"
                type="number"
                min={1}
                required
                placeholder="12345"
                value={prNumber}
                onChange={(e) => setPrNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/20 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-500 disabled:opacity-60"
            >
              {loading ? "Analyzing…" : "Analyze PR"}
            </button>
            <span className="text-xs text-zinc-500">
              Needs{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
                OPENAI_API_KEY
              </code>{" "}
              on the server. Optional{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
                GITHUB_TOKEN
              </code>{" "}
              for higher rate limits.
            </span>
          </div>
        </form>

        {error && (
          <div
            className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {error}
          </div>
        )}

        {data && (
          <div className="mt-10 space-y-8">
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold">
                {data.repo.owner}/{data.repo.repo}{" "}
                <span className="text-zinc-500">#{data.pr.number}</span>
              </h2>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                {data.pr.title}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {data.llm.summary}
              </p>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-base font-semibold">Files in PR</h3>
              <ul className="mt-3 max-h-48 overflow-auto text-sm">
                {data.filesChanged.map((f) => (
                  <li
                    key={f.filename}
                    className="flex justify-between gap-4 border-b border-zinc-100 py-2 last:border-0 dark:border-zinc-800"
                  >
                    <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                      {f.filename}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {f.status}{" "}
                      <span className="text-emerald-600">+{f.additions}</span>{" "}
                      <span className="text-red-600">−{f.deletions}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setShowDiff((s) => !s)}
                className="flex w-full items-center justify-between px-6 py-4 text-left text-base font-semibold"
              >
                PR unified diff
                <span className="text-sm font-normal text-zinc-500">
                  {showDiff ? "Hide" : "Show"}
                </span>
              </button>
              {showDiff && (
                <pre className="max-h-[28rem] overflow-auto border-t border-zinc-200 bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                  {data.diffPreview}
                </pre>
              )}
            </section>

            {affectedSectionIds.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                No README sections were flagged for updates. Your docs may already
                match the PR, or the model did not find a safe edit.
              </p>
            ) : (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold">Section review</h3>
                {affectedSectionIds.map((id) => {
                  const proposal = proposalsById.get(id);
                  const section = data.sections.find((s) => s.id === id);
                  if (!proposal?.proposedMarkdown || !section) return null;
                  const isOn = accepted[id] !== false;
                  return (
                    <article
                      key={id}
                      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                        <div>
                          <p className="text-sm font-medium">{section.title}</p>
                          {proposal.rationale && (
                            <p className="mt-1 text-xs text-zinc-500">
                              {proposal.rationale}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSection(id)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                              isOn
                                ? "bg-emerald-600 text-white"
                                : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                            }`}
                          >
                            {isOn ? "Accepted" : "Rejected"}
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-0 md:grid-cols-2">
                        <div className="border-b border-zinc-100 md:border-b-0 md:border-r dark:border-zinc-800">
                          <p className="bg-zinc-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-950">
                            Before
                          </p>
                          <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
                            {section.markdown}
                          </pre>
                        </div>
                        <div>
                          <p className="bg-zinc-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-950">
                            After
                          </p>
                          <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
                            {proposal.proposedMarkdown}
                          </pre>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Merged README preview</h3>
                <button
                  type="button"
                  onClick={copyMerged}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Copy markdown
                </button>
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                {mergedReadme || "(empty)"}
              </pre>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
