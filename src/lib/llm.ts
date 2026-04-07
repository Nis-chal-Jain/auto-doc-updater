import type { ReadmeSection } from "./readme-sections";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export type LlmSectionProposal = {
  sectionId: string;
  affected: boolean;
  proposedMarkdown?: string;
  rationale?: string;
};

export type LlmAnalyzeResult = {
  summary: string;
  proposals: LlmSectionProposal[];
};

export async function analyzeReadmeAgainstDiff(params: {
  prTitle: string;
  diff: string;
  readmePath: string;
  sections: ReadmeSection[];
}): Promise<LlmAnalyzeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const sectionCatalog = params.sections.map((s) => ({
    id: s.id,
    title: s.title,
    level: s.level,
    markdown: s.markdown,
  }));

  const system = `You are a technical writer helping keep repository documentation accurate.
You receive a Git pull request unified diff and the current README (split into sections).
Only propose README updates for sections that are clearly outdated or incomplete because of the code changes in the diff.
Do not rewrite sections that are still accurate. Do not invent features not shown in the diff.
For each section you mark affected, provide the full replacement markdown for that section (including the same heading line style as before, except for the introduction section which has no heading line).
Return strict JSON only with keys: summary (string), proposals (array of { sectionId, affected, proposedMarkdown?, rationale? }).`;

  const user = JSON.stringify(
    {
      prTitle: params.prTitle,
      readmePath: params.readmePath,
      diff: params.diff,
      sections: sectionCatalog,
    },
    null,
    2
  );

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty LLM response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("LLM returned non-JSON");
  }

  const obj = parsed as {
    summary?: string;
    proposals?: LlmSectionProposal[];
  };

  return {
    summary: typeof obj.summary === "string" ? obj.summary : "",
    proposals: Array.isArray(obj.proposals) ? obj.proposals : [],
  };
}
