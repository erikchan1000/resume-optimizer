import type { ParsedResume, AnalyzeResponse } from "./types";

function tokenize(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
  return new Set(
    normalized
      .split(" ")
      .map((s) => s.trim())
      .filter((s) => s.length > 2 && !/^\d+$/.test(s))
  );
}

export function resumeText(resume: ParsedResume): string {
  const parts = [
    resume.contact.name,
    resume.contact.email,
    resume.skills.join(" "),
    ...resume.experience.flatMap((e) => [e.company, e.role, ...(e.bullets ?? [])]),
    ...resume.projects.flatMap((p) => [p.title, ...(p.bullets ?? [])]),
    ...resume.education.map((e) => e.rawText ?? [e.school, e.degree].filter(Boolean).join(" ")),
  ].filter(Boolean);
  return parts.join(" ");
}

/**
 * Keyword detection is used to: (1) show missing vs matched terms in the UI,
 * (2) pass missing keywords into the optimize LLM step. Word-level comparison
 * does not detect multi-word phrases; use extractKeywordsWithLLM + compareKeywordList for that.
 * Company name exclusion is handled in the LLM keyword extraction prompt, not via a blocklist.
 */
/**
 * Word-level keyword comparison (no multi-word phrases).
 */
export function compareKeywords(
  resume: ParsedResume,
  jobDescription: string
): AnalyzeResponse {
  const jobTokens = tokenize(jobDescription);
  const resumeTokens = tokenize(resumeText(resume));
  const missingKeywords: string[] = [];
  const matchedKeywords: string[] = [];
  for (const t of jobTokens) {
    if (resumeTokens.has(t)) {
      matchedKeywords.push(t);
    } else {
      missingKeywords.push(t);
    }
  }
  return { missingKeywords, matchedKeywords };
}

/**
 * Check which of a list of keywords/phrases appear in the resume (substring match, case-insensitive).
 * Use this with LLM-extracted keywords to get matched vs missing including multi-word phrases.
 * The LLM extraction prompt instructs the model not to include the company name.
 */
export function compareKeywordList(
  resume: ParsedResume,
  keywordList: string[]
): AnalyzeResponse {
  const text = resumeText(resume).toLowerCase();
  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];
  for (const kw of keywordList) {
    const normalized = kw.trim();
    if (!normalized) continue;
    if (text.includes(normalized.toLowerCase())) {
      matchedKeywords.push(normalized);
    } else {
      missingKeywords.push(normalized);
    }
  }
  return { missingKeywords, matchedKeywords };
}
