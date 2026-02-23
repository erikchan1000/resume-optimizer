/**
 * Builds a flat payload from parsed (and optimized) resume for template placeholders,
 * and populates a template docx buffer with those values.
 */
import { patchDocument, PatchType, TextRun } from "docx";
import JSZip from "jszip";
import type { ParsedResume, OptimizedSections } from "./types";

const MAX_EDUCATION = 2;
const MAX_EXPERIENCE = 3;
const MAX_EXPERIENCE_BULLETS = 4;
const MAX_PROJECTS = 2;
const MAX_PROJECT_BULLETS = 2;

/** Build flat placeholder key → value map for template substitution. */
export function buildTemplatePayload(
  parsed: ParsedResume,
  optimized?: OptimizedSections | null
): Record<string, string> {
  const contact = optimized?.contact ?? parsed.contact;
  const education = optimized?.education ?? parsed.education;
  const experience = optimized?.experience ?? parsed.experience;
  const skills = optimized?.skills ?? parsed.skills;

  const payload: Record<string, string> = {
    "contact.name": contact?.name ?? "",
    "contact.phone": contact?.phone ?? "",
    "contact.email": contact?.email ?? "",
    "contact.location": contact?.location ?? "",
    "contact.linkedin": contact?.linkedin ?? "",
    skills: (skills ?? parsed.skills).join(", "),
  };

  for (let i = 0; i < MAX_EDUCATION; i++) {
    const e = education?.[i] ?? parsed.education?.[i];
    payload[`education.${i}.school`] = e?.school ?? "";
    payload[`education.${i}.degree`] = e?.degree ?? "";
    payload[`education.${i}.dates`] = e?.dates ?? "";
    payload[`education.${i}.gpa`] = e?.gpa ?? "";
  }

  for (let i = 0; i < MAX_EXPERIENCE; i++) {
    const opt = experience?.[i];
    const orig = parsed.experience?.[i];
    payload[`experience.${i}.company`] = opt?.company ?? orig?.company ?? "";
    payload[`experience.${i}.role`] = opt?.role ?? orig?.role ?? "";
    payload[`experience.${i}.location`] = orig?.location ?? "";
    payload[`experience.${i}.dates`] = orig?.dates ?? "";
    payload[`experience.${i}.subheader`] = opt?.subheader ?? orig?.subheader ?? "";
    const bullets = opt?.bullets ?? orig?.bullets ?? [];
    for (let j = 0; j < MAX_EXPERIENCE_BULLETS; j++) {
      payload[`experience.${i}.bullet.${j}`] = bullets[j] ?? "";
    }
  }

  for (let i = 0; i < MAX_PROJECTS; i++) {
    const proj = parsed.projects?.[i];
    payload[`projects.${i}.title`] = proj?.title ?? "";
    const bullets = proj?.bullets ?? [];
    for (let j = 0; j < MAX_PROJECT_BULLETS; j++) {
      payload[`projects.${i}.bullet.${j}`] = bullets[j] ?? "";
    }
  }

  return payload;
}

/** Populate template docx buffer with payload; returns filled docx as Buffer. */
export async function populateTemplate(
  templateBuffer: Buffer,
  payload: Record<string, string>
): Promise<Buffer> {
  const patches: Record<string, { type: typeof PatchType.PARAGRAPH; children: (TextRun)[] }> = {};
  for (const [key, value] of Object.entries(payload)) {
    const safe = escapeXmlText(value);
    patches[key] = {
      type: PatchType.PARAGRAPH,
      children: [new TextRun(safe)],
    };
  }

  let result = await patchDocument({
    outputType: "nodebuffer",
    data: templateBuffer,
    patches,
    placeholderDelimiters: { start: "{{", end: "}}" },
  });

  let outBuffer = Buffer.isBuffer(result) ? result : Buffer.from(new Uint8Array(result as unknown as ArrayBuffer));

  // patchDocument does not replace placeholders inside hyperlinks or some other runs.
  // Fallback: replace any remaining {{key}} in document.xml with payload values.
  const zip = await JSZip.loadAsync(outBuffer);
  const docEntry = zip.file("word/document.xml");
  if (docEntry) {
    let docXml = await docEntry.async("string");
    let changed = false;
    for (const [key, value] of Object.entries(payload)) {
      const placeholder = `{{${key}}}`;
      if (docXml.includes(placeholder)) {
        docXml = docXml.split(placeholder).join(escapeXmlText(value));
        changed = true;
      }
    }
    if (changed) {
      zip.file("word/document.xml", docXml);
      outBuffer = await zip.generateAsync({ type: "nodebuffer" });
    }
  }

  return outBuffer;
}

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
