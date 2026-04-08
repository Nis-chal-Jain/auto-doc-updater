import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createDocsPullRequest } from "@/lib/github-pr";
import { authOptions } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const token = session?.accessToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Sign in with GitHub first (or set GITHUB_TOKEN)." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      owner?: string;
      repo?: string;
      prNumber?: number;
      readmePath?: string;
      readmeMarkdown?: string;
      originalReadme?: string;
    };

    const owner = String(body.owner ?? "").trim();
    const repo = String(body.repo ?? "").trim();
    const prNumber = Number(body.prNumber);
    const readmePath = String(body.readmePath ?? "README.md").trim();
    const readmeMarkdown = String(body.readmeMarkdown ?? "");
    const originalReadme = String(body.originalReadme ?? "");

    if (!owner || !repo || !Number.isFinite(prNumber) || prNumber < 1) {
      return NextResponse.json(
        { error: "Invalid owner, repo, or prNumber." },
        { status: 400 }
      );
    }

    const result = await createDocsPullRequest({
      token,
      owner,
      repo,
      prNumber,
      readmePath,
      readmeMarkdown,
      originalReadme,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
