import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchRepoPulls } from "@/lib/github";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { owner?: string; repo?: string };
    const owner = String(body.owner ?? "").trim();
    const repo = String(body.repo ?? "").trim();
    if (!owner || !repo) {
      return NextResponse.json({ error: "owner and repo are required." }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const headerToken = req.headers.get("x-github-token") ?? "";
    const token = headerToken || session?.accessToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated with GitHub." }, { status: 401 });
    }

    const pulls = await fetchRepoPulls(owner, repo, token);
    return NextResponse.json({
      pulls: pulls.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        headRef: pr.head.ref,
        author: pr.user.login,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
