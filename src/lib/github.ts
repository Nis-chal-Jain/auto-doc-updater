const GITHUB_API = "https://api.github.com";

function authHeaders(token?: string): HeadersInit {
  const authToken = token ?? process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

async function ghJson<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: authHeaders(token),
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
  pullNumber: number,
  token?: string
): Promise<PullRequestInfo> {
  return ghJson<PullRequestInfo>(
    `/repos/${owner}/${repo}/pulls/${pullNumber}`
    ,
    token
  );
}

export async function fetchPullRequestDiff(
  owner: string,
  repo: string,
  pullNumber: number,
  token?: string
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}`,
    {
      headers: {
        ...authHeaders(token),
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
  pullNumber: number,
  token?: string
): Promise<PrFile[]> {
  const files: PrFile[] = [];
  let page = 1;
  for (;;) {
    const batch = await ghJson<PrFile[]>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=${page}`
      ,
      token
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
  ref: string,
  token?: string
): Promise<{ path: string; text: string } | null> {
  const candidates = ["README.md", "Readme.md", "readme.md"];
  for (const path of candidates) {
    try {
      const res = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
        { headers: authHeaders(token), next: { revalidate: 0 } }
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

export type UserRepo = {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  owner: { login: string };
};

export type RepoPull = {
  number: number;
  title: string;
  state: string;
  head: { ref: string };
  user: { login: string };
};

export async function fetchUserRepos(token: string): Promise<UserRepo[]> {
  const repos: UserRepo[] = [];
  let page = 1;
  for (;;) {
    const batch = await ghJson<UserRepo[]>(
      `/user/repos?sort=updated&per_page=100&page=${page}`,
      token
    );
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return repos;
}

export async function fetchRepoPulls(
  owner: string,
  repo: string,
  token: string
): Promise<RepoPull[]> {
  return ghJson<RepoPull[]>(
    `/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=100`,
    token
  );
}
