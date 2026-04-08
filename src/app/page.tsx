"use client";

import { SectionDiffView } from "@/components/SectionDiffView";
import { signIn, signOut, useSession } from "next-auth/react";
import { useMemo, useState } from "react";

type ReadmeSection = { id: string; headingLine: string; title: string; level: number; markdown: string };
type LlmSectionProposal = { sectionId: string; affected: boolean; proposedMarkdown?: string; rationale?: string };
type RepoOption = { id: number; fullName: string; owner: string; name: string; private: boolean };
type PullOption = { number: number; title: string; state: string; headRef: string; author: string };
type AnalyzeResponse = {
  repo: { owner: string; repo: string };
  pr: { number: number; title: string; headRef: string };
  readmePath: string;
  readmeFull: string;
  sections: ReadmeSection[];
  diffPreview: string;
  filesChanged: { filename: string; status: string; additions: number; deletions: number }[];
  llm: { summary: string; proposals: LlmSectionProposal[] };
};

function mergeReadme(sections: ReadmeSection[], proposalsById: Map<string, LlmSectionProposal>, accepted: Record<string, boolean>) {
  return sections
    .map((s) => {
      const p = proposalsById.get(s.id);
      return p?.affected && p.proposedMarkdown && accepted[s.id] !== false ? p.proposedMarkdown : s.markdown;
    })
    .filter(Boolean)
    .join("\n\n");
}

export default function Home() {
  const { data: session, status } = useSession();
  const isAuthed = status === "authenticated";
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [pulls, setPulls] = useState<PullOption[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedPr, setSelectedPr] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingPulls, setLoadingPulls] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [prBusy, setPrBusy] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [prResultUrl, setPrResultUrl] = useState<string | null>(null);

  const selectedRepoObj = useMemo(() => repos.find((r) => r.fullName === selectedRepo) ?? null, [repos, selectedRepo]);
  const proposalsById = useMemo(() => {
    const m = new Map<string, LlmSectionProposal>();
    for (const p of data?.llm.proposals ?? []) m.set(p.sectionId, p);
    return m;
  }, [data]);
  const affectedSectionIds = useMemo(
    () => (data?.llm.proposals ?? []).filter((p) => p.affected && p.proposedMarkdown).map((p) => p.sectionId),
    [data]
  );
  const mergedReadme = useMemo(() => (data ? mergeReadme(data.sections, proposalsById, accepted) : ""), [data, proposalsById, accepted]);

  const loadRepos = async () => {
    setError(null);
    setLoadingRepos(true);
    try {
      const res = await fetch("/api/github/repos");
      const json = (await res.json()) as { repos?: RepoOption[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setRepos(json.repos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load repositories");
    } finally {
      setLoadingRepos(false);
    }
  };

  const loadPulls = async (fullName: string) => {
    setError(null);
    setLoadingPulls(true);
    setPulls([]);
    setSelectedPr("");
    try {
      const [owner, repo] = fullName.split("/");
      const res = await fetch("/api/github/pulls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner, repo }) });
      const json = (await res.json()) as { pulls?: PullOption[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setPulls(json.pulls ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load PRs");
    } finally {
      setLoadingPulls(false);
    }
  };

  const analyze = async () => {
    if (!selectedRepoObj || !selectedPr) return;
    setError(null);
    setData(null);
    setAccepted({});
    setAnalyzing(true);
    setPrError(null);
    setPrResultUrl(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: selectedRepoObj.owner, repo: selectedRepoObj.name, prNumber: Number(selectedPr) }),
      });
      const json = (await res.json()) as AnalyzeResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Analyze failed (${res.status})`);
      const initial: Record<string, boolean> = {};
      for (const p of json.llm.proposals) if (p.affected && p.proposedMarkdown) initial[p.sectionId] = true;
      setAccepted(initial);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyze failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const createDocsPr = async () => {
    if (!data || mergedReadme === data.readmeFull) return;
    setPrBusy(true);
    setPrError(null);
    setPrResultUrl(null);
    try {
      const res = await fetch("/api/create-docs-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: data.repo.owner,
          repo: data.repo.repo,
          prNumber: data.pr.number,
          readmePath: data.readmePath,
          readmeMarkdown: mergedReadme,
          originalReadme: data.readmeFull,
        }),
      });
      const json = (await res.json()) as { pullRequestUrl?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Create PR failed (${res.status})`);
      if (json.pullRequestUrl) {
        setPrResultUrl(json.pullRequestUrl);
        window.open(json.pullRequestUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setPrError(e instanceof Error ? e.message : "Failed to open docs PR");
    } finally {
      setPrBusy(false);
    }
  };

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mb-2 text-3xl font-semibold tracking-tight">GitHub docs sync assistant</h1>
            <p className="text-zinc-600 dark:text-zinc-400">Login, pick repo and PR, review README updates, then create a docs PR.</p>
          </div>
          {!isAuthed ? (
            <button
              type="button"
              onClick={() => signIn("github")}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Login with GitHub
            </button>
          ) : (
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              Logout
            </button>
          )}
        </div>

        {!isAuthed ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <button type="button" onClick={() => signIn("github")} className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">
              Login with GitHub
            </button>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Signed in as {session?.user?.email ?? session?.user?.name ?? "GitHub user"}</p>
                <button type="button" onClick={() => signOut()} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">Logout</button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
                <select value={selectedRepo} onChange={(e) => { const v = e.target.value; setSelectedRepo(v); if (v) void loadPulls(v); }} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                  <option value="">Select repository...</option>
                  {repos.map((repo) => <option key={repo.id} value={repo.fullName}>{repo.fullName}</option>)}
                </select>
                <button type="button" onClick={loadRepos} disabled={loadingRepos} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{loadingRepos ? "Loading repos..." : "Load repositories"}</button>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto]">
                <select value={selectedPr} onChange={(e) => setSelectedPr(e.target.value)} disabled={!selectedRepo || loadingPulls} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 disabled:opacity-60">
                  <option value="">Select open PR...</option>
                  {pulls.map((pr) => <option key={pr.number} value={pr.number}>#{pr.number} {pr.title}</option>)}
                </select>
                <button type="button" onClick={analyze} disabled={!selectedRepo || !selectedPr || analyzing} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{analyzing ? "Analyzing..." : "Analyze README"}</button>
              </div>
            </section>

            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</p>}

            {data && (
              <>
                <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                  <h2 className="text-lg font-semibold">{data.repo.owner}/{data.repo.repo} #{data.pr.number}</h2>
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">{data.pr.title}</p>
                  <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{data.llm.summary}</p>
                </section>
                <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <button type="button" onClick={() => setShowDiff((s) => !s)} className="flex w-full items-center justify-between px-6 py-4 text-left text-base font-semibold">
                    PR unified diff
                    <span className="text-sm font-normal text-zinc-500">{showDiff ? "Hide" : "Show"}</span>
                  </button>
                  {showDiff && <pre className="max-h-[28rem] overflow-auto border-t border-zinc-200 bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">{data.diffPreview}</pre>}
                </section>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Section review</h3>
                  {affectedSectionIds.map((id) => {
                    const section = data.sections.find((s) => s.id === id);
                    const proposal = proposalsById.get(id);
                    if (!section || !proposal?.proposedMarkdown) return null;
                    const isOn = accepted[id] !== false;
                    return (
                      <article key={id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                          <div>
                            <p className="text-sm font-medium">{section.title}</p>
                            {proposal.rationale && <p className="mt-1 text-xs text-zinc-500">{proposal.rationale}</p>}
                          </div>
                          <button type="button" onClick={() => setAccepted((prev) => ({ ...prev, [id]: !prev[id] }))} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${isOn ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"}`}>
                            {isOn ? "Accepted" : "Rejected"}
                          </button>
                        </div>
                        <SectionDiffView before={section.markdown} after={proposal.proposedMarkdown} />
                      </article>
                    );
                  })}
                </div>
                <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">Merged README preview</h3>
                    <button type="button" onClick={createDocsPr} disabled={prBusy || mergedReadme === data.readmeFull} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                      {prBusy ? "Creating PR..." : "Accept and create PR"}
                    </button>
                  </div>
                  {prError && <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{prError}</p>}
                  {prResultUrl && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">PR opened: <a href={prResultUrl} target="_blank" rel="noreferrer" className="underline">{prResultUrl}</a></p>}
                  <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">{mergedReadme || "(empty)"}</pre>
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
