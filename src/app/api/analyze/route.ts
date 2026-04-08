import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  fetchPullRequest,
  fetchPullRequestDiff,
  fetchPullRequestFiles,
  fetchReadmeAtRef,
  truncateDiff,
} from "@/lib/github";
import { authOptions } from "@/lib/auth";
import { splitReadmeIntoSections } from "@/lib/readme-sections";
import { analyzeReadmeAgainstDiff } from "@/lib/llm";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      owner?: string;
      repo?: string;
      prNumber?: number;
    };
    const owner = String(body.owner ?? "").trim();
    const repo = String(body.repo ?? "").trim();
    const prNumber = Number(body.prNumber);
    if (!owner || !repo || !Number.isFinite(prNumber) || prNumber < 1) {
      return NextResponse.json(
        { error: "Provide owner/repo and a valid PR number." },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    const token = session?.accessToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Sign in with GitHub first (or set GITHUB_TOKEN)." },
        { status: 401 }
      );
    }

    const pr = await fetchPullRequest(owner, repo, prNumber, token);
    const [diff, files] = await Promise.all([
      fetchPullRequestDiff(owner, repo, prNumber, token),
      fetchPullRequestFiles(owner, repo, prNumber, token),
    ]);

    const readme = await fetchReadmeAtRef(owner, repo, pr.head.ref, token);
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
