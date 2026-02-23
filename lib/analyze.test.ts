import fs from "fs";
import path from "path";
import { describe, it, expect, beforeAll } from "vitest";
import { compareKeywords, compareKeywordList, resumeText } from "./analyze";
import { parseResumeFromPath } from "./resume-parser";
import { extractKeywordsWithLLM, isLLMConfigured } from "./llm";
import type { ParsedResume } from "./types";

const RESUME_FIXTURE_PATH = path.join(
  process.cwd(),
  "Erik_Chan_resume (1).docx"
);

const KALSHI_JOB_DESCRIPTION_PATH = path.join(
  process.cwd(),
  "fixtures",
  "kalshi-job-description.txt"
);

/** Kalshi Software Engineer, Product job description (single source of truth: fixtures/kalshi-job-description.txt). */
function loadKalshiJobDescription(): string {
  return fs.readFileSync(KALSHI_JOB_DESCRIPTION_PATH, "utf-8").trim();
}

const KALSHI_JOB_DESCRIPTION = loadKalshiJobDescription();

function minimalResume(overrides: Partial<ParsedResume> = {}): ParsedResume {
  return {
    contact: {},
    education: [],
    experience: [],
    projects: [],
    skills: [],
    ...overrides,
  };
}

describe("analyze (keyword extraction and job description comparison)", () => {
  describe("compareKeywords with minimal resume and job text", () => {
    it("returns matched keywords that appear in both job and resume", () => {
      const resume = minimalResume({
        skills: ["Python", "Java", "AWS", "REST APIs"],
        experience: [
          {
            company: "Acme",
            role: "Software Engineer",
            bullets: ["Built backend services and APIs"],
          },
        ],
      });
      const job = "Software Engineer backend Python Java AWS REST APIs";
      const result = compareKeywords(resume, job);
      expect(result.matchedKeywords).toContain("python");
      expect(result.matchedKeywords).toContain("java");
      expect(result.matchedKeywords).toContain("aws");
      expect(result.matchedKeywords).toContain("software");
      expect(result.matchedKeywords).toContain("engineer");
      expect(result.matchedKeywords).toContain("backend");
      expect(result.matchedKeywords).toContain("apis");
    });

    it("returns missing keywords that appear in job but not in resume", () => {
      const resume = minimalResume({
        skills: ["Python", "TypeScript"],
      });
      const job = "Python Golang Java PostgreSQL MongoDB";
      const result = compareKeywords(resume, job);
      expect(result.matchedKeywords).toContain("python");
      expect(result.missingKeywords).toContain("golang");
      expect(result.missingKeywords).toContain("java");
      expect(result.missingKeywords).toContain("postgresql");
      expect(result.missingKeywords).toContain("mongodb");
    });

    it("tokenizes on word boundaries and normalizes to lowercase", () => {
      const resume = minimalResume({ skills: ["Node.js", "REST"] });
      const job = "REST API Node.js backend";
      const result = compareKeywords(resume, job);
      expect(result.matchedKeywords).toContain("rest");
      expect(result.matchedKeywords).toContain("node");
    });

    it("includes experience bullets and project content in resume text", () => {
      const resume = minimalResume({
        experience: [
          { company: "X", role: "Engineer", bullets: ["Used Kafka and Redis"] },
        ],
        projects: [{ title: "Trading", bullets: ["Real-time market data"] }],
      });
      const job = "Kafka Redis real-time market data trading";
      const result = compareKeywords(resume, job);
      expect(result.matchedKeywords).toContain("kafka");
      expect(result.matchedKeywords).toContain("redis");
      expect(result.matchedKeywords).toContain("real");
      expect(result.matchedKeywords).toContain("market");
      expect(result.matchedKeywords).toContain("data");
      expect(result.matchedKeywords).toContain("trading");
    });

    it("excludes very short tokens (length <= 2) so Go does not match Golang", () => {
      const resume = minimalResume({ skills: ["Go"] });
      const job = "Golang Java backend";
      const result = compareKeywords(resume, job);
      expect(result.missingKeywords).toContain("golang");
    });

    it("returns all job tokens as either matched or missing", () => {
      const resume = minimalResume({ skills: ["Python"] });
      const job = "Python Java Golang";
      const result = compareKeywords(resume, job);
      const combined = new Set([...result.matchedKeywords, ...result.missingKeywords]);
      expect(combined.has("python")).toBe(true);
      expect(combined.has("java")).toBe(true);
      expect(combined.has("golang")).toBe(true);
    });
  });

  describe("compareKeywords with Kalshi job description and Erik Chan resume fixture", () => {
    let parsedResume: ParsedResume;
    let result: { missingKeywords: string[]; matchedKeywords: string[] };

    beforeAll(async () => {
      parsedResume = await parseResumeFromPath(RESUME_FIXTURE_PATH);
      result = compareKeywords(parsedResume, KALSHI_JOB_DESCRIPTION);
    });

    it("returns a non-empty result", () => {
      expect(result.matchedKeywords.length).toBeGreaterThan(0);
      expect(result.missingKeywords.length).toBeGreaterThan(0);
    });

    it("matchedKeywords includes role-related terms from resume", () => {
      expect(result.matchedKeywords).toContain("software");
      expect(result.matchedKeywords).toContain("engineer");
    });

    it("matchedKeywords includes tech from resume that appears in job", () => {
      expect(result.matchedKeywords).toContain("aws");
      const hasApi = result.matchedKeywords.some((t) => t === "api" || t === "apis");
      expect(hasApi).toBe(true);
    });

    it("matchedKeywords includes product/design/backend terms present in resume", () => {
      const hasRelevant = ["product", "design", "backend", "systems", "data"].some(
        (t) => result.matchedKeywords.includes(t)
      );
      expect(hasRelevant).toBe(true);
    });

    it("missingKeywords includes Kalshi-specific or prediction-market terms", () => {
      const hasKalshiOrPrediction = ["kalshi", "prediction", "markets"].some(
        (t) => result.missingKeywords.includes(t)
      );
      expect(hasKalshiOrPrediction).toBe(true);
    });

    it("missingKeywords includes required tech from job not in resume (e.g. Golang or databases)", () => {
      const hasJobTech = ["golang", "postgresql", "mysql", "mongodb"].some(
        (t) => result.missingKeywords.includes(t)
      );
      expect(hasJobTech).toBe(true);
    });

    it("missingKeywords includes bonus-area terms when not in resume", () => {
      const hasBonus = ["websockets", "azure", "experiments"].some(
        (t) => result.missingKeywords.includes(t)
      );
      expect(hasBonus).toBe(true);
    });

    it("every job token is either in matched or missing", () => {
      const jobWords = KALSHI_JOB_DESCRIPTION.toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .split(" ")
        .map((s) => s.trim())
        .filter((s) => s.length > 2 && !/^\d+$/.test(s));
      const jobSet = new Set(jobWords);
      const matchedSet = new Set(result.matchedKeywords);
      const missingSet = new Set(result.missingKeywords);
      for (const token of jobSet) {
        expect(matchedSet.has(token) || missingSet.has(token)).toBe(true);
      }
    });
  });

  describe("LLM keyword extraction + compare (integration)", () => {
    const describeWhenLLMConfigured = isLLMConfigured()
      ? describe
      : describe.skip;

    // Uses real LLM API (see .env). May fail with 429 if quota exceeded.
    describeWhenLLMConfigured("with real API key and Kalshi JD + Erik Chan resume", () => {
      let parsedResume: ParsedResume;
      let extractedKeywords: string[];
      let result: { missingKeywords: string[]; matchedKeywords: string[] };

      beforeAll(async () => {
        parsedResume = await parseResumeFromPath(RESUME_FIXTURE_PATH);
        extractedKeywords = await extractKeywordsWithLLM(KALSHI_JOB_DESCRIPTION);
        result = compareKeywordList(parsedResume, extractedKeywords);
      }, 30_000);

      it("extracts a non-empty list of keywords from the job description", () => {
        expect(extractedKeywords.length).toBeGreaterThan(0);
      });

      it("does not include company name (Kalshi/Kalshians) in extracted keywords", () => {
        const lower = extractedKeywords.map((k) => k.toLowerCase());
        expect(lower).not.toContain("kalshi");
        expect(lower).not.toContain("kalshians");
      });

      it("extracted keywords include terms from the Kalshi job description (e.g. backend, Golang, REST API, databases)", () => {
        const lower = extractedKeywords.map((k) => k.toLowerCase());
        const fromJD = ["backend", "golang", "java", "rest", "api", "postgresql", "mysql", "mongodb", "database"];
        const hasFromJD = fromJD.some(
          (term) =>
            lower.includes(term) || lower.some((k) => k.includes(term))
        );
        expect(hasFromJD).toBe(true);
      });

      it("returns matched and missing keywords when compared to resume", () => {
        expect(result.matchedKeywords.length).toBeGreaterThan(0);
        expect(result.missingKeywords.length).toBeGreaterThan(0);
      });

      it("matchedKeywords includes terms from resume that appear in job (e.g. backend, API, AWS)", () => {
        const matchedLower = result.matchedKeywords.map((k) => k.toLowerCase());
        const hasRelevant = ["backend", "api", "aws", "data", "systems"].some(
          (t) => matchedLower.includes(t) || matchedLower.some((m) => m.includes(t))
        );
        expect(hasRelevant).toBe(true);
      });

      it("missingKeywords includes job requirements not in resume (e.g. Golang or databases)", () => {
        const missingLower = result.missingKeywords.map((k) => k.toLowerCase());
        const hasMissing = ["golang", "postgresql", "mysql", "mongodb", "rest api", "nosql"].some(
          (t) => missingLower.includes(t) || missingLower.some((m) => m.includes(t))
        );
        expect(hasMissing).toBe(true);
      });
    });
  });

  describe("compareKeywordList (phrase-aware)", () => {
    it("detects multi-word phrases when present in resume", () => {
      const resume = minimalResume({
        experience: [
          {
            company: "X",
            role: "Engineer",
            bullets: [
              "Built backend services",
              "Designed data structures for high throughput",
              "Worked with financial markets and trading",
            ],
          },
        ],
        skills: ["API design", "REST API", "growth mindset", "database"],
      });
      const keywords = [
        "backend",
        "data structures",
        "database",
        "API",
        "financial markets",
        "growth mindset",
      ];
      const out = compareKeywordList(resume, keywords);
      expect(out.matchedKeywords).toContain("backend");
      expect(out.matchedKeywords).toContain("data structures");
      expect(out.matchedKeywords).toContain("database");
      expect(out.matchedKeywords).toContain("API");
      expect(out.matchedKeywords).toContain("financial markets");
      expect(out.matchedKeywords).toContain("growth mindset");
    });

    it("reports missing when phrase not in resume", () => {
      const resume = minimalResume({ skills: ["Python"], experience: [] });
      const keywords = ["backend", "data structures", "Golang"];
      const out = compareKeywordList(resume, keywords);
      expect(out.missingKeywords).toContain("backend");
      expect(out.missingKeywords).toContain("data structures");
      expect(out.missingKeywords).toContain("Golang");
    });
  });

  describe("resumeText includes all sections for keyword search", () => {
    it("concatenates contact, skills, experience, projects, education", () => {
      const resume = minimalResume({
        contact: { name: "Jane" },
        skills: ["Go"],
        experience: [{ company: "Y", role: "Dev", bullets: ["Did backend work"] }],
        projects: [{ title: "Proj", bullets: ["Used databases"] }],
      });
      const text = resumeText(resume);
      expect(text).toMatch(/jane/i);
      expect(text).toMatch(/backend/);
      expect(text).toMatch(/databases/);
    });
  });
});
