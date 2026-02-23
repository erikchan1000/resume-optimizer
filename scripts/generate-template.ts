/**
 * Builds public/template.docx from the existing resume file so the template
 * has the exact same styling and layout. Replaces content with {{fieldName}}
 * placeholders in document order so the backend can populate from parsed data.
 *
 * Run: npx tsx scripts/generate-template.ts
 * Or: node --import tsx scripts/generate-template.ts
 *
 * Uses RESUME_SOURCE_PATH env or "Erik_Chan_resume (1).docx" in project root.
 */
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import JSZip from "jszip";
import { parseResumeFromPath } from "../lib/resume-parser";
import type { ParsedResume } from "../lib/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const RESUME_SOURCE =
  process.env.RESUME_SOURCE_PATH ||
  path.join(PROJECT_ROOT, "Erik_Chan_resume (1).docx");
const OUT_PATH = path.join(PROJECT_ROOT, "public", "template.docx");

type Replacement = [from: string, to: string];

function buildReplacementsInDocumentOrder(parsed: ParsedResume): Replacement[] {
  const pairs: Replacement[] = [];

  if (parsed.contact?.name) pairs.push([parsed.contact.name, "{{contact.name}}"]);
  if (parsed.contact?.email) pairs.push([parsed.contact.email, "{{contact.email}}"]);
  if (parsed.contact?.phone) pairs.push([parsed.contact.phone, "{{contact.phone}}"]);
  if (parsed.contact?.location) pairs.push([parsed.contact.location, "{{contact.location}}"]);
  if (parsed.contact?.linkedin) pairs.push([parsed.contact.linkedin, "{{contact.linkedin}}"]);

  parsed.education?.forEach((e, i) => {
    if (e.school) pairs.push([e.school, `{{education.${i}.school}}`]);
    if (e.degree) pairs.push([e.degree, `{{education.${i}.degree}}`]);
    if (e.dates) pairs.push([e.dates, `{{education.${i}.dates}}`]);
    if (e.gpa) pairs.push([e.gpa, `{{education.${i}.gpa}}`]);
  });

  parsed.experience?.forEach((exp, i) => {
    if (exp.company) pairs.push([exp.company, `{{experience.${i}.company}}`]);
    if (exp.location) pairs.push([exp.location, `{{experience.${i}.location}}`]);
    if (exp.dates) pairs.push([exp.dates, `{{experience.${i}.dates}}`]);
    if (exp.role) pairs.push([exp.role, `{{experience.${i}.role}}`]);
    if (exp.subheader) pairs.push([exp.subheader, `{{experience.${i}.subheader}}`]);
    exp.bullets?.forEach((b, j) => {
      if (b) pairs.push([b, `{{experience.${i}.bullet.${j}}}`]);
    });
  });

  parsed.projects?.forEach((proj, i) => {
    if (proj.title) pairs.push([proj.title, `{{projects.${i}.title}}`]);
    proj.bullets?.forEach((b, j) => {
      if (b) pairs.push([b, `{{projects.${i}.bullet.${j}}}`]);
    });
  });

  const skillsStr = parsed.skills?.join(", ");
  if (skillsStr) pairs.push([skillsStr, "{{skills}}"]);

  return pairs;
}

/** Replace first occurrence of `from` with `to` in `str`. */
function replaceFirst(str: string, from: string, to: string): string {
  const idx = str.indexOf(from);
  if (idx === -1) return str;
  return str.slice(0, idx) + to + str.slice(idx + from.length);
}

async function main() {
  console.log("Parsing resume:", RESUME_SOURCE);
  const parsed = await parseResumeFromPath(RESUME_SOURCE);

  console.log("Loading docx as zip...");
  const buf = await fs.readFile(RESUME_SOURCE);
  const zip = await JSZip.loadAsync(buf);

  const docEntry = zip.file("word/document.xml");
  if (!docEntry) throw new Error("word/document.xml not found in docx");

  let docXml = await docEntry.async("string");
  const replacements = buildReplacementsInDocumentOrder(parsed);

  console.log("Applying", replacements.length, "replacements (first occurrence each)...");
  for (const [from, to] of replacements) {
    if (!from || from.length === 0) continue;
    const before = docXml;
    docXml = replaceFirst(docXml, from, to);
    if (docXml === before) {
      // Optional: log when a value wasn't found (e.g. different formatting)
      // console.warn("Not found in document:", from.slice(0, 40) + (from.length > 40 ? "…" : ""));
    }
  }

  zip.file("word/document.xml", docXml);

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  const outBuf = await zip.generateAsync({ type: "nodebuffer" });
  await fs.writeFile(OUT_PATH, outBuf);

  console.log("Wrote", OUT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
