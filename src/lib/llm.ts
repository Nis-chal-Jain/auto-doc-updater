import type { ReadmeSection } from "./readme-sections";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";

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

type GeminiGenerateResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; code?: number };
};

export async function analyzeReadmeAgainstDiff(params: {
  prTitle: string;
  diff: string;
  readmePath: string;
  sections: ReadmeSection[];
}): Promise<LlmAnalyzeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
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
Respond with JSON only (no markdown fences) using this shape:
{"summary":"string","proposals":[{"sectionId":"string","affected":boolean,"proposedMarkdown":"string (omit if not affected)","rationale":"string"}]}`;

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: user }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  const data = (await res.json()) as GeminiGenerateResponse;

  if (!res.ok || data.error) {
    const msg =
      data.error?.message ??
      (typeof data === "object" ? JSON.stringify(data).slice(0, 400) : "unknown");
    throw new Error(`Gemini ${res.status}: ${msg}`);
  }

  if (data.promptFeedback?.blockReason) {
    throw new Error(
      `Gemini blocked the prompt: ${data.promptFeedback.blockReason}`
    );
  }

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw || typeof raw !== "string") {
    const reason = data.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Empty or invalid Gemini response (finish: ${reason})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Gemini returned non-JSON");
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
