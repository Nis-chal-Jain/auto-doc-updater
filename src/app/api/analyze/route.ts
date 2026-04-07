import { NextRequest, NextResponse } from "next/server";
import {
  fetchPullRequest,
  fetchPullRequestDiff,
  fetchPullRequestFiles,
  fetchReadmeAtRef,
  parseRepoUrl,
  truncateDiff,
} from "@/lib/github";
import { splitReadmeIntoSections } from "@/lib/readme-sections";
import { analyzeReadmeAgainstDiff } from "@/lib/llm";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      repoUrl?: string;
      prNumber?: number;
    };
    const repoUrl = String(body.repoUrl ?? "").trim();
    const prNumber = Number(body.prNumber);
    if (!repoUrl || !Number.isFinite(prNumber) || prNumber < 1) {
      return NextResponse.json(
        { error: "Provide a valid GitHub repo URL and PR number." },
        { status: 400 }
      );
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: "Could not parse a github.com owner/repo from the URL." },
        { status: 400 }
      );
    }

    const { owner, repo } = parsed;
    const pr = await fetchPullRequest(owner, repo, prNumber);
    const [diff, files] = await Promise.all([
      fetchPullRequestDiff(owner, repo, prNumber),
      fetchPullRequestFiles(owner, repo, prNumber),
    ]);

    const readme = await fetchReadmeAtRef(owner, repo, pr.head.ref);
    const readmeText = readme?.text ?? "";
    const readmePath = readme?.path ?? "README.md";
    const sections = splitReadmeIntoSections(readmeText);
    const truncated = truncateDiff(diff, 120_000);

    const llm = await analyzeReadmeAgainstDiff({
      prTitle: pr.title,
      diff: truncated,
      readmePath,
      sections,
    });

    return NextResponse.json({
      repo: { owner, repo },
      pr: {
        number: pr.number,
        title: pr.title,
        headRef: pr.head.ref,
      },
      readmePath,
      readmeFull: readmeText,
      sections,
      diffPreview: truncated,
      filesChanged: files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      })),
      llm,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
