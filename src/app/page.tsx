"use client";

import { SectionDiffView } from "@/components/SectionDiffView";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
import { GridBackground } from "@/components/ui/grid-background";
import { Spotlight } from "@/components/ui/spotlight";
import { cn } from "@/lib/utils";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

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
type AuthMethod = "none" | "token" | "oauth";

const BG = {
  gradientBackgroundStart: "rgb(5, 5, 6)",
  gradientBackgroundEnd: "rgb(15, 15, 18)",
  firstColor: "48, 48, 52",
  secondColor: "72, 72, 78",
  thirdColor: "58, 58, 64",
  fourthColor: "38, 38, 42",
  fifthColor: "24, 24, 27",
  pointerColor: "100, 100, 110",
  blendingValue: "normal",
  size: "88%",
} as const;

const field =
  "w-full rounded-xl border border-zinc-800/90 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-zinc-600 focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50";

const panel =
  "rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.035)_inset] backdrop-blur-xl";

const ghostBtn =
  "rounded-xl border border-zinc-700/80 bg-zinc-950/40 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900/60 disabled:opacity-45 cursor-pointer";

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
  const [authMethod, setAuthMethod] = useState<AuthMethod>("none");
  const [runtimeToken, setRuntimeToken] = useState("");
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [hasOAuth, setHasOAuth] = useState(false);
  const [hasServerGithubToken, setHasServerGithubToken] = useState(false);
  const [useServerTokenMode, setUseServerTokenMode] = useState(false);
  const isAuthed =
    status === "authenticated" ||
    useServerTokenMode ||
    (authMethod === "token" && runtimeToken.trim().length > 0);
  const authHeaders = useMemo<Record<string, string>>(() => {
    if (authMethod === "token" && runtimeToken.trim()) {
      return { "x-github-token": runtimeToken.trim() };
    }
    return {} as Record<string, string>;
  }, [authMethod, runtimeToken]);
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

  useEffect(() => {
    const loadAuthConfig = async () => {
      try {
        const res = await fetch("/api/auth/config");
        const json = (await res.json()) as {
          hasOAuth?: boolean;
          hasServerGithubToken?: boolean;
        };
        const oauth = Boolean(json.hasOAuth);
        const serverToken = Boolean(json.hasServerGithubToken);
        setHasOAuth(oauth);
        setHasServerGithubToken(serverToken);
        if (!oauth && serverToken) {
          setUseServerTokenMode(true);
        }
      } catch {
        // ignore, page will still allow OAuth path if configured
      }
    };
    void loadAuthConfig();
  }, []);

  const loadRepos = async () => {
    setError(null);
    setLoadingRepos(true);
    try {
      const res = await fetch("/api/github/repos", { headers: authHeaders });
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
      const res = await fetch("/api/github/pulls", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ owner, repo }),
      });
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
        headers: { "Content-Type": "application/json", ...authHeaders },
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
        headers: { "Content-Type": "application/json", ...authHeaders },
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

  const onOAuthLogin = () => {
    if (!clientIdInput.trim() || !clientSecretInput.trim()) {
      setError("Enter both GitHub client ID and client secret.");
      return;
    }
    setError(null);
    setAuthMethod("oauth");
    void signIn("github");
  };

  return (
    <div className="relative min-h-[100dvh] text-zinc-100">
      <div className="fixed inset-0 -z-20">
        <BackgroundGradientAnimation {...BG} interactive={false} containerClassName="min-h-[100dvh] w-full" />
      </div>
      <GridBackground />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Spotlight />
        <header className="relative mb-10 flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800/80 pb-8">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Documentation</p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">AUTODOC - GitHub docs sync assistant</h1>
            <p className="text-sm leading-relaxed text-zinc-400">
              Authenticate, choose a repository and pull request, review README proposals, then open a documentation PR — all in one
              workflow.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status === "authenticated" && (
              <button type="button" onClick={() => signOut()} className={ghostBtn}>
                Log out
              </button>
            )}
            {!isAuthed && hasOAuth && (
              <button type="button" onClick={() => signIn("github")} className={cn(ghostBtn, "min-w-[10rem]")}>
                Login with GitHub
              </button>
            )}
            {!hasOAuth && hasServerGithubToken && !useServerTokenMode && (
              <button type="button" onClick={() => setUseServerTokenMode(true)} className={cn(ghostBtn, "min-w-[12rem]")}>
                Use server token
              </button>
            )}
          </div>
        </header>

        {!isAuthed ? (
          <section className={panel}>
            {authMethod === "none" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setAuthMethod("token")} className={cn(ghostBtn, "w-full sm:w-auto")}>
                  GitHub token
                </button>
                <button type="button" onClick={() => setAuthMethod("oauth")} className={cn(ghostBtn, "w-full sm:w-auto")}>
                  OAuth credentials
                </button>
              </div>
            )}
            {authMethod === "token" && (
              <div className="space-y-4">
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">Personal access token</label>
                <input
                  type="password"
                  value={runtimeToken}
                  onChange={(e) => setRuntimeToken(e.target.value)}
                  placeholder="ghp_…"
                  className={field}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!runtimeToken.trim()) {
                      setError("Enter a GitHub token.");
                      return;
                    }
                    setError(null);
                    setUseServerTokenMode(false);
                  }}
                  className={cn(ghostBtn, "w-full sm:w-auto")}
                >
                  Continue with token
                </button>
              </div>
            )}
            {authMethod === "oauth" && (
              <div className="space-y-4">
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">OAuth app</label>
                <input
                  type="text"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  placeholder="Client ID"
                  className={field}
                />
                <input
                  type="password"
                  value={clientSecretInput}
                  onChange={(e) => setClientSecretInput(e.target.value)}
                  placeholder="Client secret"
                  className={field}
                />
                <button type="button" onClick={onOAuthLogin} className={cn(ghostBtn, "w-full sm:w-auto")}>
                  Continue with OAuth
                </button>
                {!hasOAuth && (
                  <p className="text-xs text-zinc-500">
                    Server env must define <code className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-[11px] text-zinc-400">GITHUB_CLIENT_ID</code>{" "}
                    and <code className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-[11px] text-zinc-400">GITHUB_CLIENT_SECRET</code>.
                  </p>
                )}
              </div>
            )}
          </section>
        ) : (
          <div className="space-y-6">
            <section className={panel}>
              <div className="flex flex-col gap-4 border-b border-zinc-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Session</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    Signed in as <span className="font-medium text-zinc-100">{session?.user?.email ?? session?.user?.name ?? "GitHub user"}</span>
                  </p>
                </div>
                <button type="button" onClick={() => signOut()} className={cn(ghostBtn, "shrink-0")}>
                  Log out
                </button>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">Repository</label>
                  <select
                    value={selectedRepo}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedRepo(v);
                      if (v) void loadPulls(v);
                    }}
                    className={field}
                  >
                    <option value="">Select repository…</option>
                    {repos.map((repo) => (
                      <option key={repo.id} value={repo.fullName}>
                        {repo.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={loadRepos}
                  disabled={loadingRepos}
                  className={cn(ghostBtn, "w-full md:w-[11rem]")}
                >
                  {loadingRepos ? "Loading…" : "Load repos"}
                </button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">Pull request</label>
                  <select
                    value={selectedPr}
                    onChange={(e) => setSelectedPr(e.target.value)}
                    disabled={!selectedRepo || loadingPulls}
                    className={field}
                  >
                    <option value="">Select open PR…</option>
                    {pulls.map((pr) => (
                      <option key={pr.number} value={pr.number}>
                        #{pr.number} {pr.title}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={analyze}
                  disabled={!selectedRepo || !selectedPr || analyzing}
                  className={cn(ghostBtn, "w-full md:w-[11rem]")}
                >
                  {analyzing ? "Analyzing…" : "Analyze README"}
                </button>
              </div>
            </section>

            {error && (
              <p className="rounded-xl border border-red-900/50 bg-red-950/35 px-4 py-3 text-sm text-red-200/95 backdrop-blur-sm">{error}</p>
            )}

            {data && (
              <>
                <section className={panel}>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pull request</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-50">
                    {data.repo.owner}/{data.repo.repo} #{data.pr.number}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">{data.pr.title}</p>
                  <p className="mt-5 border-l-2 border-zinc-600 pl-4 text-sm leading-relaxed text-zinc-300">{data.llm.summary}</p>
                </section>

                <section className={cn(panel, "p-0 overflow-hidden")}>
                  <button
                    type="button"
                    onClick={() => setShowDiff((s) => !s)}
                    className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-zinc-900/40"
                  >
                    <span className="text-sm font-semibold text-zinc-100">PR unified diff</span>
                    <span className="text-xs font-medium text-zinc-500">{showDiff ? "Hide" : "Show"}</span>
                  </button>
                  {showDiff && (
                    <pre className="max-h-[28rem] overflow-auto border-t border-zinc-800/90 bg-black/40 p-4 font-mono text-xs leading-relaxed text-zinc-300">
                      {data.diffPreview}
                    </pre>
                  )}
                </section>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Section review</h3>
                  {affectedSectionIds.map((id) => {
                    const section = data.sections.find((s) => s.id === id);
                    const proposal = proposalsById.get(id);
                    if (!section || !proposal?.proposedMarkdown) return null;
                    const isOn = accepted[id] !== false;
                    return (
                      <article key={id} className={cn(panel, "overflow-hidden p-0")}>
                        <div className="flex flex-col gap-3 border-b border-zinc-800/80 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium text-zinc-100">{section.title}</p>
                            {proposal.rationale && <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{proposal.rationale}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => setAccepted((prev) => ({ ...prev, [id]: !prev[id] }))}
                            className={cn(
                              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
                              isOn ? "bg-zinc-100 text-zinc-950" : "border border-zinc-700 bg-zinc-900/80 text-zinc-400"
                            )}
                          >
                            {isOn ? "Accepted" : "Rejected"}
                          </button>
                        </div>
                        <SectionDiffView before={section.markdown} after={proposal.proposedMarkdown} />
                      </article>
                    );
                  })}
                </div>

                <section className={panel}>
                  <div className="flex flex-col gap-4 border-b border-zinc-800/80 pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <h3 className="text-lg font-semibold text-zinc-50">Merged README preview</h3>
                    <button
                      type="button"
                      onClick={createDocsPr}
                      disabled={prBusy || mergedReadme === data.readmeFull}
                      className={cn(ghostBtn, "w-full sm:w-auto")}
                    >
                      {prBusy ? "Creating PR…" : "Create docs PR"}
                    </button>
                  </div>
                  {prError && (
                    <p className="mt-4 rounded-xl border border-red-900/50 bg-red-950/35 px-4 py-3 text-sm text-red-200/95">{prError}</p>
                  )}
                  {prResultUrl && (
                    <p className="mt-4 text-sm text-zinc-400">
                      PR opened:{" "}
                      <a href={prResultUrl} target="_blank" rel="noreferrer" className="font-medium text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:text-white">
                        {prResultUrl}
                      </a>
                    </p>
                  )}
                  <pre className="mt-5 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800/80 bg-black/35 p-4 font-mono text-xs leading-relaxed text-zinc-300">
                    {mergedReadme || "(empty)"}
                  </pre>
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
