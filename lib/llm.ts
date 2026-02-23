import OpenAI from "openai";
import type { ParsedResume, OptimizedSections, OptimizeResponse } from "./types";

/** OpenAI-compatible client + model. Supports OpenAI, Moonshot (Kimi K2), and OpenRouter. */
const MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  moonshot: "kimi-k2-turbo-preview",
  openrouter: "moonshotai/kimi-k2-0905",
} as const;

function getLLMConfig(): { client: OpenAI; model: string } {
  const modelOverride = process.env.LLM_MODEL?.trim();

if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: modelOverride || DEFAULT_MODELS.openai,
    };
  }

  if (process.env.MOONSHOT_API_KEY) {
    return {
      client: new OpenAI({
        apiKey: process.env.MOONSHOT_API_KEY,
        baseURL: MOONSHOT_BASE_URL,
      }),
      model: modelOverride || DEFAULT_MODELS.moonshot,
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      client: new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: OPENROUTER_BASE_URL,
      }),
      model: modelOverride || DEFAULT_MODELS.openrouter,
    };
  }
    throw new Error(
    "No LLM API key set. Set one of: OPENAI_API_KEY, MOONSHOT_API_KEY, OPENROUTER_API_KEY (e.g. in .env or .env.local)"
  );
}

/** True if any supported LLM provider is configured. */
export function isLLMConfigured(): boolean {
  return !!(
    process.env.OPENAI_API_KEY ||
    process.env.MOONSHOT_API_KEY ||
    process.env.OPENROUTER_API_KEY
  );
}

const KEYWORD_EXTRACTION_PROMPT = `You are an expert at extracting ATS-relevant keywords from job descriptions for software engineering roles.

From the given job description, extract ONLY keywords and phrases that are impactful for a software engineering position and that ATS systems or recruiters look for. Include:
- Technologies: languages (e.g. Java, Go, Python, TypeScript), frameworks (e.g. React, Spring), tools (e.g. Docker, Kubernetes, AWS, PostgreSQL), protocols (e.g. REST, gRPC)
- Technical concepts: e.g. distributed systems, low latency, APIs, microservices, databases, CI/CD, testing, system design
- Role-relevant multi-word phrases: e.g. "REST API", "low latency", "data structures", "system design", "backend services", "cloud infrastructure"

EXCLUDE strictly:
- The hiring company or employer name.
- Common English words and stopwords: e.g. and, for, with, from, that, next, time, per, state, events, offering, design (when not "system design"), market (when not part of a technical phrase like "real-time market data"), annually, equity, core (when vague), services (when used generically), high (when not "high availability" or similar).
- Generic business or filler language that does not signal technical fit: e.g. "next generation", "complex", "managers", "financial" (unless "financial systems" or similar technical domain).
- Location unless it is a stated requirement.

Rule of thumb: only include a term if a software engineer would meaningfully add it to their resume or if an ATS would match on it for this role. Prefer specific tech and concrete phrases over vague or non-technical words.
Return valid JSON only: { "keywords": ["keyword1", "phrase of two words", ...] }
Keep each keyword/phrase concise (one to five words).`;

const systemPrompt = `You are a resume expert. Given a candidate's resume and a job description, suggest concrete bullet edits and keyword insertions so the resume passes ATS and aligns with the job. Preserve the candidate's facts; only rephrase or add relevant keywords. Return valid JSON only, with this shape:
{
  "optimizedSections": {
    "experience": [{"company": "...", "role": "...", "bullets": ["..."]}],
    "education": [{"school": "...", "degree": "...", "dates": "...", "gpa": "...", "rawText": "..."}],
    "projects": [{"title": "...", "bullets": ["..."]}],
    "skills": ["skill1", "skill2"]
  }
}
Include only sections you are revising. Omit a section to keep the original. Keep the same number and order of experience, education, and project entries; only change the bullet text (and optionally project titles) and add skills.`;

export async function optimizeResumeWithLLM(
  resume: ParsedResume,
  jobDescription: string,
  missingKeywords?: string[]
): Promise<OptimizeResponse> {
  const { client: openai, model } = getLLMConfig();

  const resumeText = [
    "## Contact",
    resume.contact.name,
    resume.contact.email,
    resume.contact.phone,
    resume.contact.location,
    resume.contact.linkedin,
    "## Education",
    ...resume.education.map((e) => e.rawText ?? [e.school, e.degree, e.dates, e.gpa].filter(Boolean).join(" ")),
    "## Experience",
    ...resume.experience.flatMap((e) => [
      `${e.company} – ${e.role} | ${e.dates ?? ""}`,
      ...(e.bullets ?? []),
    ]),
    "## Projects",
    ...resume.projects.flatMap((p) => [p.title ?? "", ...(p.bullets ?? [])]),
    "## Skills",
    resume.skills.join(", "),
  ]
    .filter(Boolean)
    .join("\n");

  const userContent = [
    "### Resume",
    resumeText,
    "### Job description",
    jobDescription,
    ...(missingKeywords && missingKeywords.length > 0
      ? ["### Missing keywords to weave in (optional)", missingKeywords.join(", ")]
      : []),
  ].join("\n\n");

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("Empty LLM response");
  }
  const parsed = JSON.parse(raw) as { optimizedSections?: OptimizedSections };
  return {
    optimizedSections: parsed.optimizedSections ?? {},
    fullText: raw,
  };
}

/**
 * Use the LLM to extract important keywords and phrases from a job description.
 * Returns both single-word terms and multi-word phrases (e.g. "data structures", "financial markets").
 * Excludes company/employer name.
 */
export async function extractKeywordsWithLLM(jobDescription: string): Promise<string[]> {
  const { client: openai, model } = getLLMConfig();
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: KEYWORD_EXTRACTION_PROMPT },
      { role: "user", content: jobDescription },
    ],
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { keywords?: string[] };
  return Array.isArray(parsed.keywords) ? parsed.keywords : [];
}
