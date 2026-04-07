const GITHUB_API = "https://api.github.com";

export type RepoRef = { owner: string; repo: string };

export function parseRepoUrl(input: string): RepoRef | null {
  const trimmed = input.trim();
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (!u.hostname.endsWith("github.com")) return null;
    const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const repo = parts[1].replace(/\.git$/i, "");
    return { owner: parts[0], repo };
  } catch {
    return null;
  }
}

function authHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function ghJson<T>(path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: authHeaders(),
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

export type PullRequestInfo = {
  title: string;
  number: number;
  head: { ref: string; sha: string };
  base: { ref: string };
};

export async function fetchPullRequest(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PullRequestInfo> {
  return ghJson<PullRequestInfo>(
    `/repos/${owner}/${repo}/pulls/${pullNumber}`
  );
}

export async function fetchPullRequestDiff(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}`,
    {
      headers: {
        ...authHeaders(),
        Accept: "application/vnd.github.diff",
      },
      next: { revalidate: 0 },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub diff ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.text();
}

export type PrFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

export async function fetchPullRequestFiles(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PrFile[]> {
  const files: PrFile[] = [];
  let page = 1;
  for (;;) {
    const batch = await ghJson<PrFile[]>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=${page}`
    );
    files.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return files;
}

type ContentFile = {
  type: "file";
  encoding: "base64";
  content: string;
};

export async function fetchReadmeAtRef(
  owner: string,
  repo: string,
  ref: string
): Promise<{ path: string; text: string } | null> {
  const candidates = ["README.md", "Readme.md", "readme.md"];
  for (const path of candidates) {
    try {
      const res = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
        { headers: authHeaders(), next: { revalidate: 0 } }
      );
      if (res.status === 404) continue;
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`README ${res.status}: ${t.slice(0, 300)}`);
      }
      const data = (await res.json()) as ContentFile;
      if (data.type !== "file" || data.encoding !== "base64") continue;
      const text = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString(
        "utf8"
      );
      return { path, text };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("README")) throw e;
      continue;
    }
  }
  return null;
}

export function truncateDiff(diff: string, maxChars: number): string {
  if (diff.length <= maxChars) return diff;
  return (
    diff.slice(0, maxChars) +
    `\n\n… [diff truncated: ${diff.length - maxChars} more characters]`
  );
}
