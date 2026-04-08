import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { authOptions } from "@/lib/auth";
import { fetchUserRepos } from "@/lib/github";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const headerToken = (await headers()).get("x-github-token") ?? "";
    const token = headerToken || session?.accessToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated with GitHub." }, { status: 401 });
    }
    const repos = await fetchUserRepos(token);
    return NextResponse.json({
      repos: repos.map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        owner: repo.owner.login,
        name: repo.name,
        private: repo.private,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
