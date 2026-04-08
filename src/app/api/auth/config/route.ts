import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasOAuth: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    hasServerGithubToken: Boolean(process.env.GITHUB_TOKEN),
  });
}
