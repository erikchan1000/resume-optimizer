import path from "path";
import fs from "fs/promises";
import { describe, it, expect, beforeAll } from "vitest";
import { parseResumeFromPath } from "./resume-parser";
import { buildTemplatePayload, populateTemplate } from "./template-populate";
import JSZip from "jszip";

const RESUME_FIXTURE_PATH = path.join(process.cwd(), "Erik_Chan_resume (1).docx");
const TEMPLATE_PATH = path.join(process.cwd(), "public", "template.docx");

describe("template-populate (projects.title injection)", () => {
  let parsed: Awaited<ReturnType<typeof parseResumeFromPath>>;

  beforeAll(async () => {
    parsed = await parseResumeFromPath(RESUME_FIXTURE_PATH);
  });

  describe("parsed resume has at least two projects with titles", () => {
    it("parses at least 2 projects", () => {
      expect(parsed.projects.length).toBeGreaterThanOrEqual(2);
    });

    it("second project has a non-empty title (projects[1].title)", () => {
      expect(parsed.projects[1]).toBeDefined();
      expect(parsed.projects[1].title).toBeDefined();
      expect(String(parsed.projects[1].title).trim()).not.toBe("");
    });
  });

  describe("buildTemplatePayload includes projects.1.title", () => {
    it('payload["projects.1.title"] equals parsed.projects[1].title', () => {
      const payload = buildTemplatePayload(parsed);
      const expectedTitle = parsed.projects[1]?.title ?? "";
      expect(payload["projects.1.title"]).toBe(expectedTitle);
      expect(payload["projects.1.title"]).not.toBe("");
    });

    it("payload includes projects.0.title and projects.1.title", () => {
      const payload = buildTemplatePayload(parsed);
      expect(payload).toHaveProperty("projects.0.title");
      expect(payload).toHaveProperty("projects.1.title");
    });
  });

  describe("populateTemplate injects projects.1.title into docx", () => {
    it("after populateTemplate, output docx contains second project title and not placeholder", async () => {
      const templateBuffer = await fs.readFile(TEMPLATE_PATH);
      const payload = buildTemplatePayload(parsed);
      const secondTitle = payload["projects.1.title"];
      expect(secondTitle).not.toBe("");

      const outBuffer = await populateTemplate(templateBuffer, payload);

      const zip = await JSZip.loadAsync(outBuffer);
      const docEntry = zip.file("word/document.xml");
      expect(docEntry).toBeDefined();
      const docXml = await docEntry!.async("string");

      expect(docXml).not.toContain("{{projects.1.title}}");
      expect(docXml).toContain(secondTitle);
    });
  });
});
