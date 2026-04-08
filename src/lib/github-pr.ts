const GITHUB_API = "https://api.github.com";

function writeHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghWrite<T>(
  token: string,
  path: string,
  init: RequestInit
): Promise<{ ok: boolean; status: number; data: T; text: string }> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: { ...writeHeaders(token), ...init.headers },
  });
  const text = await res.text();
  let data: T = undefined as T;
  try {
    data = text ? (JSON.parse(text) as T) : (undefined as T);
  } catch {
    /* leave text */
  }
  return { ok: res.ok, status: res.status, data, text };
}

export type CreateDocsPrResult = {
  pullRequestUrl: string;
  pullRequestNumber: number;
  branchName: string;
};

/**
 * Creates a branch from the PR head, commits README updates, opens a PR targeting the PR branch.
 */
export async function createDocsPullRequest(params: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  readmePath: string;
  readmeMarkdown: string;
  originalReadme: string;
}): Promise<CreateDocsPrResult> {
  const token = params.token;
  if (params.readmeMarkdown === params.originalReadme) {
    throw new Error("No README changes to commit — merge preview matches the original.");
  }

  const prPath = `/repos/${params.owner}/${params.repo}/pulls/${params.prNumber}`;
  const prRes = await ghWrite<{
    head: { ref: string; sha: string };
    base: { ref: string };
    title: string;
  }>(token, prPath, { method: "GET" });

  if (!prRes.ok) {
    throw new Error(
      `Failed to load PR #${params.prNumber}: ${prRes.text.slice(0, 400)}`
    );
  }

  const headSha = prRes.data.head.sha;
  const headRef = prRes.data.head.ref;
  const branchName = `docs/readme-sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const refPath = `/repos/${params.owner}/${params.repo}/git/refs`;
  const createRef = await ghWrite<{ ref: string }>(token, refPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: headSha,
    }),
  });

  if (!createRef.ok) {
    throw new Error(
      `Failed to create branch: ${createRef.text.slice(0, 400)}`
    );
  }

  const encodedPath = params.readmePath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const contentUrl = `/repos/${params.owner}/${params.repo}/contents/${encodedPath}?ref=${encodeURIComponent(branchName)}`;

  const existing = await ghWrite<{ sha?: string }>(token, contentUrl, {
    method: "GET",
  });

  const fileSha = existing.ok && existing.data?.sha ? existing.data.sha : undefined;

  const contentB64 = Buffer.from(params.readmeMarkdown, "utf8").toString(
    "base64"
  );

  const putBody: Record<string, string> = {
    message: `docs: sync ${params.readmePath} for PR #${params.prNumber}`,
    content: contentB64,
    branch: branchName,
  };
  if (fileSha) {
    putBody.sha = fileSha;
  }

  const putPath = `/repos/${params.owner}/${params.repo}/contents/${encodedPath}`;
  const put = await ghWrite<{ commit?: { sha: string } }>(token, putPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(putBody),
  });

  if (!put.ok) {
    throw new Error(`Failed to commit README: ${put.text.slice(0, 400)}`);
  }

  const pullsPath = `/repos/${params.owner}/${params.repo}/pulls`;
  const pullBody = {
    title: `docs: sync ${params.readmePath} (PR #${params.prNumber})`,
    head: branchName,
    base: headRef,
    body: `Automated README sync suggested for **#${params.prNumber}**.\n\nPlease review and merge into \`${headRef}\` to update docs alongside that PR.`,
  };

  const pull = await ghWrite<{ html_url: string; number: number }>(
    token,
    pullsPath,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pullBody),
    }
  );

  if (!pull.ok) {
    throw new Error(`Failed to open pull request: ${pull.text.slice(0, 400)}`);
  }

  return {
    pullRequestUrl: pull.data.html_url,
    pullRequestNumber: pull.data.number,
    branchName,
  };
}
