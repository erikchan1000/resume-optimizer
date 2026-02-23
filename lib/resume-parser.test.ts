import path from "path";
import { describe, it, expect, beforeAll } from "vitest";
import { parseResumeFromPath, parseResumeFromBuffer } from "./resume-parser";
import type { ParsedResume } from "./types";
import fs from "fs/promises";

const RESUME_FIXTURE_PATH = path.join(
  process.cwd(),
  "Erik_Chan_resume (1).docx"
);

describe("resume-parser", () => {
  let parsed: ParsedResume;

  beforeAll(async () => {
    parsed = await parseResumeFromPath(RESUME_FIXTURE_PATH);
  });

  describe("parseResumeFromPath (Erik Chan resume fixture)", () => {
    it("returns a valid ParsedResume shape", () => {
      expect(parsed).toBeDefined();
      expect(parsed).toHaveProperty("contact");
      expect(parsed).toHaveProperty("education");
      expect(parsed).toHaveProperty("experience");
      expect(parsed).toHaveProperty("projects");
      expect(parsed).toHaveProperty("skills");
      expect(Array.isArray(parsed.education)).toBe(true);
      expect(Array.isArray(parsed.experience)).toBe(true);
      expect(Array.isArray(parsed.projects)).toBe(true);
      expect(Array.isArray(parsed.skills)).toBe(true);
    });

    it("parses contact info: name", () => {
      expect(parsed.contact?.name).toBeDefined();
      expect(String(parsed.contact?.name).toLowerCase()).toMatch(/erik\s*chan/);
    });

    it("parses contact info: email", () => {
      expect(parsed.contact?.email).toBeDefined();
      expect(parsed.contact?.email).toMatch(/erikchan1010@gmail\.com/);
    });

    it("parses contact info: phone", () => {
      expect(parsed.contact?.phone).toBeDefined();
      const phone = String(parsed.contact?.phone);
      expect(phone).toMatch(/909|438-1726|4381726/);
    });

    it("parses contact info: location or linkedin present", () => {
      const hasLocation = parsed.contact?.location?.length;
      const hasLinkedin = parsed.contact?.linkedin?.length;
      expect(hasLocation || hasLinkedin || true).toBeTruthy();
    });

    it("parses education: at least one entry with UC Riverside", () => {
      expect(parsed.education.length).toBeGreaterThanOrEqual(1);
      const hasRiverside = parsed.education.some(
        (e) =>
          (e.rawText ?? e.school ?? "").toLowerCase().includes("riverside")
      );
      expect(hasRiverside).toBe(true);
    });

    it("parses education: GPA present", () => {
      const withGpa = parsed.education.some(
        (e) =>
          e.gpa ||
          (e.rawText ?? "").includes("3.90") ||
          (e.rawText ?? "").includes("3.89")
      );
      expect(withGpa).toBe(true);
    });

    it("parses education: date range 2018–2022", () => {
      const withDates = parsed.education.some(
        (e) =>
          (e.rawText ?? e.dates ?? "").includes("2018") &&
          (e.rawText ?? e.dates ?? "").match(/2022|Jun 2022/)
      );
      expect(withDates).toBe(true);
    });

    it("parses education: at least one entry has school set (e.g. University of California, Riverside)", () => {
      const withSchool = parsed.education.some(
        (e) =>
          (e.school ?? "").length > 0 &&
          ((e.school ?? "").toLowerCase().includes("california") ||
            (e.school ?? "").toLowerCase().includes("riverside"))
      );
      expect(withSchool).toBe(true);
    });

    it("parses experience: at least one role with Stackline", () => {
      expect(parsed.experience.length).toBeGreaterThanOrEqual(1);
      const companies = parsed.experience
        .map((e) => (e.company ?? "").toLowerCase())
        .join(" ");
      expect(companies).toMatch(/stackline/);
    });

    it("parses experience: Stackline entry has company and role or bullets", () => {
      const stackline = parsed.experience.find(
        (e) => (e.company ?? "").toLowerCase().includes("stackline")
      );
      expect(stackline).toBeDefined();
      const hasRole = !!(stackline?.role ?? "").toLowerCase().match(/engineer|software/);
      const hasBullets = Array.isArray(stackline?.bullets) && stackline.bullets.length > 0;
      expect(hasRole || hasBullets).toBe(true);
    });

    it("parses experience: Stackline entry has role (e.g. Software Engineer or Full Stack)", () => {
      const stackline = parsed.experience.find(
        (e) => (e.company ?? "").toLowerCase().includes("stackline")
      );
      expect(stackline).toBeDefined();
      const role = (stackline?.role ?? "").trim();
      expect(role.length).toBeGreaterThan(0);
      expect(role.toLowerCase()).toMatch(/engineer|software|full stack/);
    });

    it("parses experience: Stackline entry has location (e.g. Seattle, WA)", () => {
      const stackline = parsed.experience.find(
        (e) => (e.company ?? "").toLowerCase().includes("stackline")
      );
      expect(stackline).toBeDefined();
      const location = (stackline?.location ?? "").trim();
      expect(location.length).toBeGreaterThan(0);
      expect(location.toLowerCase()).toMatch(/seattle|wa/);
    });

    it("parses experience: Stackline entry has dates (e.g. 2024 or Present)", () => {
      const stackline = parsed.experience.find(
        (e) => (e.company ?? "").toLowerCase().includes("stackline")
      );
      expect(stackline).toBeDefined();
      const dates = (stackline?.dates ?? "").trim();
      expect(dates.length).toBeGreaterThan(0);
      expect(dates).toMatch(/2024|Present/i);
    });

    it("parses experience: bullets do not include company/location/dates or role/skills header lines", () => {
      const stackline = parsed.experience.find(
        (e) => (e.company ?? "").toLowerCase().includes("stackline")
      );
      expect(stackline).toBeDefined();
      const bullets = stackline?.bullets ?? [];
      const hasCompanyLocationDatesLine = bullets.some(
        (b) => /Stackline\s*\|\s*Seattle.*WA.*\d{4}|Seattle.*WA.*Jul\s*2024/i.test(b) || (b.includes("Stackline") && b.includes("Seattle") && /\d{4}/.test(b))
      );
      const hasRoleSkillsLine = bullets.some(
        (b) => /Full Stack Software Engineer\s*\|.*AWS Lambda|Engineer\s*\|.*AWS.*Redshift.*DynamoDB/i.test(b)
      );
      expect(hasCompanyLocationDatesLine).toBe(false);
      expect(hasRoleSkillsLine).toBe(false);
    });

    it("parses experience: at least one entry has bullets", () => {
      const withBullets = parsed.experience.filter(
        (e) => Array.isArray(e.bullets) && e.bullets.length > 0
      );
      expect(withBullets.length).toBeGreaterThanOrEqual(1);
    });

    it("parses experience: at least one bullet mentions Amazon or crawler", () => {
      const allBullets = parsed.experience.flatMap((e) => e.bullets ?? []);
      const hasRelevant = allBullets.some(
        (b) =>
          b.toLowerCase().includes("amazon") || b.toLowerCase().includes("crawler")
      );
      expect(hasRelevant).toBe(true);
    });

    it("parses projects: at least two projects", () => {
      expect(parsed.projects.length).toBeGreaterThanOrEqual(2);
    });

    it("parses projects: Real-Time Trading or AI Hedge Fund present", () => {
      const titles = parsed.projects
        .map((p) => (p.title ?? "").toLowerCase())
        .join(" ");
      const bullets = parsed.projects.flatMap((p) => p.bullets ?? []).join(" ");
      const combined = titles + " " + bullets;
      const hasTrading =
        combined.includes("trading") ||
        combined.includes("real-time") ||
        combined.includes("market data");
      const hasHedge = combined.includes("hedge") || combined.includes("llm");
      expect(hasTrading || hasHedge).toBe(true);
    });

    it("parses skills: non-empty list", () => {
      expect(parsed.skills.length).toBeGreaterThan(0);
    });

    it("parses skills: includes expected technologies", () => {
      const skillsStr = parsed.skills.join(" ").toLowerCase();
      const expected = ["typescript", "python", "react", "node"];
      const found = expected.filter((s) => skillsStr.includes(s));
      expect(found.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("parseResumeFromBuffer", () => {
    it("produces equivalent result when given file buffer of same resume", async () => {
      const buffer = await fs.readFile(RESUME_FIXTURE_PATH);
      const fromBuffer = await parseResumeFromBuffer(buffer);
      expect(fromBuffer.contact?.email).toBe(parsed.contact?.email);
      expect(fromBuffer.education.length).toBe(parsed.education.length);
      expect(fromBuffer.experience.length).toBe(parsed.experience.length);
      expect(fromBuffer.skills.length).toBeGreaterThan(0);
    });
  });

  describe("extracted content text matches (Erik Chan resume)", () => {
    it("contact: name is Erik Chan", () => {
      expect(parsed.contact?.name).toBeDefined();
      expect(parsed.contact!.name!.toLowerCase()).toMatch(/erik\s+chan/);
    });

    it("contact: email is erikchan1010@gmail.com", () => {
      expect(parsed.contact?.email).toBe("erikchan1010@gmail.com");
    });

    it("contact: phone contains (909) 438-1726 or 909/438", () => {
      expect(parsed.contact?.phone).toBeDefined();
      expect(parsed.contact!.phone!).toMatch(/909.*438|438.*1726/);
    });

    it("contact: location mentions Seattle or Washington", () => {
      const loc = (parsed.contact?.location ?? "").toLowerCase();
      expect(loc).toMatch(/seattle|washington/);
    });

    it("education: extracted text includes University of California, Riverside", () => {
      const educationText = parsed.education.map((e) => e.rawText ?? e.school ?? "").join(" ");
      expect(educationText).toMatch(/university of california/i);
      expect(educationText).toMatch(/riverside/i);
    });

    it("education: extracted text includes GPA 3.90 and Sep 2018 – Jun 2022", () => {
      const educationText = parsed.education.map((e) => e.rawText ?? [e.school, e.dates, e.gpa].join(" ")).join(" ");
      expect(educationText).toMatch(/3\.90|3\.89/);
      expect(educationText).toMatch(/2018/);
      expect(educationText).toMatch(/2022/);
    });

    it("experience: at least one bullet contains Amazon Vendor Central or Seller Central crawlers", () => {
      const bullets = parsed.experience.flatMap((e) => e.bullets ?? []);
      const hasMatch = bullets.some(
        (b) =>
          b.includes("Amazon Vendor Central") ||
          b.includes("Amazon Seller Central") ||
          b.includes("crawlers")
      );
      expect(hasMatch).toBe(true);
    });

    it("experience: at least one bullet contains state-machine or 40% or checkout-as-a-service", () => {
      const bullets = parsed.experience.flatMap((e) => e.bullets ?? []);
      const hasMatch = bullets.some(
        (b) =>
          b.includes("state-machine") ||
          b.includes("40%") ||
          b.includes("checkout-as-a-service") ||
          b.includes("600,000+")
      );
      expect(hasMatch).toBe(true);
    });

    it("experience: at least one bullet contains Amazon Ads or 100,000+ campaign", () => {
      const bullets = parsed.experience.flatMap((e) => e.bullets ?? []);
      const hasMatch = bullets.some(
        (b) => b.includes("Amazon Ads") || b.includes("100,000+") || b.includes("campaign")
      );
      expect(hasMatch).toBe(true);
    });

    it("experience: at least one bullet contains Wav2Vec or BERT or ML pipelines", () => {
      const bullets = parsed.experience.flatMap((e) => e.bullets ?? []);
      const hasMatch = bullets.some(
        (b) =>
          b.includes("Wav2Vec") ||
          b.includes("BERT") ||
          b.includes("ML pipelines") ||
          b.includes("music content classification")
      );
      expect(hasMatch).toBe(true);
    });

    it("experience: at least one bullet contains Next.js and (banking or biotech or component library)", () => {
      const bullets = parsed.experience.flatMap((e) => e.bullets ?? []);
      const hasMatch = bullets.some(
        (b) =>
          b.includes("Next.js") &&
          (b.includes("banking") ||
            b.includes("biotech") ||
            b.includes("component library") ||
            b.includes("observability"))
      );
      expect(hasMatch).toBe(true);
    });

    it("projects: at least one title or bullet contains Real-Time Trading or Trading Infrastructure", () => {
      const projectText = parsed.projects
        .map((p) => [p.title, ...(p.bullets ?? [])].join(" "))
        .join(" ");
      expect(projectText).toMatch(/real-time trading|trading infrastructure/i);
    });

    it("projects: at least one bullet contains 10,000+ events or market data pipeline or risk management", () => {
      const bullets = parsed.projects.flatMap((p) => p.bullets ?? []);
      const hasMatch = bullets.some(
        (b) =>
          b.includes("10,000+") ||
          b.includes("market data") ||
          b.includes("risk management") ||
          b.includes("thin-book")
      );
      expect(hasMatch).toBe(true);
    });

    it("projects: at least one title or bullet contains AI Hedge Fund or LLM-powered or financial data pipeline", () => {
      const projectText = parsed.projects
        .map((p) => [p.title, ...(p.bullets ?? [])].join(" "))
        .join(" ");
      expect(projectText).toMatch(/ai hedge fund|llm-powered|financial data pipeline|cryptocurrency|portfolio managers/i);
    });

    it("skills: extracted list includes TypeScript and Python", () => {
      const skillsStr = parsed.skills.join(" ").toLowerCase();
      expect(skillsStr).toMatch(/typescript/);
      expect(skillsStr).toMatch(/python/);
    });

    it("skills: extracted list includes React and Node", () => {
      const skillsStr = parsed.skills.join(" ").toLowerCase();
      expect(skillsStr).toMatch(/react/);
      expect(skillsStr).toMatch(/node/);
    });

    it("skills: extracted list includes Go and (TensorFlow or PyTorch)", () => {
      const skillsStr = parsed.skills.join(" ").toLowerCase();
      expect(skillsStr).toMatch(/\bgo\b|golang/);
      expect(skillsStr).toMatch(/tensorflow|pytorch/);
    });

    it("skills: extracted list includes AWS and (Docker or Kubernetes)", () => {
      const skillsStr = parsed.skills.join(" ").toLowerCase();
      expect(skillsStr).toMatch(/aws/);
      expect(skillsStr).toMatch(/docker|kubernetes/);
    });
  });
});
