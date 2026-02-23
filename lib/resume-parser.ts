import mammoth from "mammoth";
import type {
  ParsedResume,
  Contact,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
} from "./types";

const SECTION_NAMES = [
  "contact",
  "education",
  "experience",
  "professional experience",
  "work experience",
  "projects",
  "projects & outside experience",
  "skills",
  "technical skills",
] as const;

function normalizeSectionTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extractBullets(text: string): string[] {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const bullets: string[] = [];
  const bulletStart = /^[\u2022\u2023\u25E6\u2043\u2219\-\*\d+\.]\s*/;
  for (const line of lines) {
    const cleaned = line.replace(bulletStart, "").trim();
    if (cleaned) bullets.push(cleaned);
  }
  return bullets.length > 0 ? bullets : lines.filter(Boolean);
}

function parseContactBlock(text: string): Contact {
  const contact: Contact = {};
  const emailMatch = text.match(/[\w.+%-]+@[\w.-]+\.[A-Za-z]{2,}/);
  if (emailMatch) contact.email = emailMatch[0];
  const phoneMatch = text.match(/\+?[\d\s\-().]{10,}/);
  if (phoneMatch) contact.phone = phoneMatch[0].trim();
  const linkedInMatch = text.match(/linkedin\.com\/in\/[^\s]+/i);
  if (linkedInMatch) contact.linkedin = "https://" + linkedInMatch[0];
  const locationMatch = text.match(/(?:Seattle|San Jose|Los Angeles|[\w\s]+,\s*(?:CA|WA|Washington))/);
  if (locationMatch) contact.location = locationMatch[0].trim();
  const nameMatch = text.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[\s|]/m);
  if (nameMatch) contact.name = nameMatch[1].trim();
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0 && !contact.name) {
    const first = lines[0];
    if (first && first.length < 50 && !first.includes("@") && /^[A-Za-z\s]+$/.test(first.replace(/\s/g, "")))
      contact.name = first;
  }
  return contact;
}

const DATE_RANGE_REGEX = /(\w+\s+\d{4}\s*[-–—]\s*(?:Present|\w+\s+\d{4}))/i;

function parseEducationBlock(text: string): EducationEntry[] {
  const entries: EducationEntry[] = [];
  const educationStart = new RegExp(
    "\\n(?=[A-Z][a-z].*(?:University|College|Institute|School|Bachelor|Master|PhD|B\\.?S\\.?|M\\.?S\\.?|B\\.?A\\.?|M\\.?A\\.?))",
    "i"
  );
  const blocks = text.split(educationStart);
  for (const block of blocks) {
    const t = block.trim();
    if (!t) continue;
    const datesMatch = t.match(/(\w+\s+\d{4}\s*[-–—]\s*(?:\w+\s+)?\d{4})/);
    const gpaMatch = t.match(/GPA[:\s]*([\d.]+)/i);
    let school: string | undefined;
    let degree: string | undefined;
    const degreeMatch = t.match(/(?:B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|PhD|Bachelor'?s?|Master'?s?)\s*(?:in\s+[\w\s]+)?/i);
    if (degreeMatch) degree = degreeMatch[0].trim();
    const schoolMatch = t.match(
      /(?:University of [^|\n]+|[\w\s]+(?:University|College|Institute)(?:\s+of\s+[\w\s]+)?)(?=\s*[|\n]|$)/i
    );
    if (schoolMatch) {
      school = schoolMatch[0].replace(/\s*\|\s*GPA.*$/i, "").trim();
    }
    if (!school) {
      const firstLine = t.split(/\n/)[0]?.trim() ?? "";
      if (firstLine && !DATE_RANGE_REGEX.test(firstLine) && !/^GPA/i.test(firstLine))
        school = firstLine.replace(/\s*\|\s*GPA.*$/i, "").trim();
    }
    entries.push({
      rawText: t,
      school: school || undefined,
      degree: degree || undefined,
      dates: datesMatch ? datesMatch[1] : undefined,
      gpa: gpaMatch ? gpaMatch[1] : undefined,
    });
  }
  if (entries.length === 0 && text.trim()) entries.push({ rawText: text.trim() });
  return entries;
}

const EXPERIENCE_JOB_SPLIT = /\n(?=[A-Za-z][^\n]{1,45}\n\s*\|)/;
/** Split before a line that looks like "Company | Location\tDateRange" (new job header). */
const EXPERIENCE_JOB_SPLIT_TAB_DATE = /\n(?=[^\n]*\t\w+\s+\d{4}\s*[-–—])/;
const EXPERIENCE_DATE_REGEX = /(\w+\s+\d{4}\s*[-–—]\s*(?:Present|\w+\s+\d{4}))/i;
const ROLE_KEYWORDS = /engineer|developer|lead|analyst|manager|designer|founder|architect/i;

function looksLikeLocation(s: string): boolean {
  const t = s.replace(/\s*\|\s*$/, "").trim();
  return /^[A-Za-z\s]+,\s*(?:[A-Z]{2}|Washington|California|NY|TX)$/i.test(t) || /^[A-Za-z\s]+,\s*[A-Za-z\s]+$/.test(t);
}

function looksLikeTechOrSkills(s: string): boolean {
  return /,/.test(s) || /\b(?:AWS|Python|React|Node|TypeScript|Go|Java|C#|SQL)\b/i.test(s);
}

/** Remove company/location/dates line and role/skills line from block so they are not picked up as bullets. */
function stripExperienceHeaderLines(block: string, firstLine: string): string {
  const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return block;
  const rest: string[] = [];
  let skipCount = 0;
  if (lines[0] === firstLine.trim()) {
    skipCount = 1;
    if (lines.length > 1 && lines[1].includes("|")) {
      const idx = lines[1].indexOf("|");
      const right = lines[1].slice(idx + 1).trim();
      if (looksLikeTechOrSkills(right) || ROLE_KEYWORDS.test(lines[1].slice(0, idx).trim())) {
        skipCount = 2;
      }
    }
  }
  for (let i = skipCount; i < lines.length; i++) {
    rest.push(lines[i]);
  }
  return rest.join("\n");
}

function parseExperienceBlock(text: string): ExperienceEntry[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let jobBlocks = normalized.split(EXPERIENCE_JOB_SPLIT_TAB_DATE).filter((s) => s.trim());
  if (jobBlocks.length <= 1) {
    jobBlocks = normalized.split(EXPERIENCE_JOB_SPLIT).filter((s) => s.trim());
  }
  const entries: ExperienceEntry[] = [];
  for (const block of jobBlocks) {
    const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0];
    if (!firstLine || firstLine === "WORK EXPERIENCE" || firstLine === "EXPERIENCE" || /^[A-Z\s]+$/.test(firstLine))
      continue;
    const firstPart = firstLine.split(/\t/)[0]?.trim() ?? firstLine;
    const datePartFromFirst = firstLine.split(/\t/)[1]?.trim();
    let company: string | undefined;
    let role: string | undefined;
    let location: string | undefined;
    let dates: string | undefined;
    let subheader: string | undefined;
    if (datePartFromFirst && EXPERIENCE_DATE_REGEX.test(datePartFromFirst)) {
      const m = datePartFromFirst.match(EXPERIENCE_DATE_REGEX);
      if (m) dates = m[1];
    }
    if (firstPart.includes("|")) {
      const idx = firstPart.indexOf("|");
      const left = firstPart.slice(0, idx).trim();
      const right = firstPart.slice(idx + 1).trim();
      if (looksLikeLocation(right)) {
        company = left.length < 50 ? left : undefined;
        location = right;
      } else {
        company = firstPart.length < 50 ? firstPart : undefined;
      }
    } else {
      company = firstPart.length < 50 ? firstPart : undefined;
    }
    const headerLines = lines.slice(1, 6);
    for (const line of headerLines) {
      const dateMatch = line.match(EXPERIENCE_DATE_REGEX);
      if (dateMatch) {
        dates = dateMatch[1];
        continue;
      }
      if (line.includes("|")) {
        const idx = line.indexOf("|");
        const left = line.slice(0, idx).trim();
        const right = line.slice(idx + 1).trim();
        if (ROLE_KEYWORDS.test(left)) {
          if (!role) role = left;
          if (looksLikeLocation(right)) location = right;
        } else if (looksLikeLocation(left)) {
          location = left;
          if (ROLE_KEYWORDS.test(right)) role = right;
        } else if (looksLikeLocation(right)) {
          location = right;
          if (left.length > 0 && left.length < 60) role = left;
        } else if (looksLikeTechOrSkills(right) && ROLE_KEYWORDS.test(left)) {
          role = left;
          subheader = right;
        }
        continue;
      }
      if (looksLikeLocation(line)) location = line;
      else if (ROLE_KEYWORDS.test(line) && line.length < 60 && !role) role = line;
    }
    if (!location && lines.length >= 2) {
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const line = lines[i]?.trim() ?? "";
        const next = (lines[i + 1]?.trim() ?? "").replace(/\s+/g, " ");
        if (/^[A-Za-z\s]+,?\s*$/i.test(line) && (/^[A-Z]{2}$/.test(next) || /^(?:Washington|California)$/i.test(next))) {
          location = line.replace(/\s*,\s*$/, ", ").replace(/,?\s*$/, ", ") + next;
          break;
        }
      }
    }
    if (!dates) {
      const blockDateMatch = block.match(EXPERIENCE_DATE_REGEX);
      if (blockDateMatch) dates = blockDateMatch[1];
    }
    if (!location) {
      const headerPart = block.slice(0, 400);
      const locationInBlock = headerPart.match(/([A-Za-z\s]+,\s*(?:[A-Z]{2}|Washington|California|NY|TX))(?:\s*[\n|]|$)/im);
      if (locationInBlock) location = locationInBlock[1].trim();
    }
    const blockWithoutHeader = stripExperienceHeaderLines(block, firstLine);
    const bullets = extractBullets(blockWithoutHeader);
    entries.push({
      company: (company ?? "").length < 50 ? company ?? undefined : undefined,
      role: role || undefined,
      location: location || undefined,
      dates: dates || undefined,
      subheader: subheader || undefined,
      bullets: bullets.length > 0 ? bullets : [],
    });
  }
  if (entries.length === 0 && text.trim()) {
    const bullets = extractBullets(text);
    entries.push({ bullets: bullets.length > 0 ? bullets : [text.trim()] });
  }
  return entries;
}

function parseProjectsBlock(text: string): ProjectEntry[] {
  const entries: ProjectEntry[] = [];
  const projectStart = new RegExp("\\n(?=[A-Z][^\\n]{5,60}\\s*\\|\\s*[A-Za-z])");
  const parts = text.split(projectStart).filter((s) => s.trim());
  for (const part of parts) {
    const firstLine = part.split(/\n/)[0]?.trim() ?? "";
    const bullets = extractBullets(part.slice(firstLine.length));
    const title = firstLine.replace(/\s*\|.*$/, "").trim() || firstLine;
    entries.push({ title: title || undefined, bullets });
  }
  if (entries.length === 0 && text.trim()) {
    const bullets = extractBullets(text);
    entries.push({ bullets: bullets.length > 0 ? bullets : [text.trim()] });
  }
  return entries;
}

function parseSkillsBlock(text: string): string[] {
  const normalized = text.replace(/\n/g, ",").replace(/,+/g, ",");
  return normalized
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse docx from a file path (server-only).
 */
export async function parseResumeFromPath(filePath: string): Promise<ParsedResume> {
  const result = await mammoth.convertToHtml({ path: filePath });
  return parseHtmlToResume(result.value);
}

/**
 * Parse docx from a buffer (e.g. uploaded file in memory).
 */
export async function parseResumeFromBuffer(buffer: Buffer): Promise<ParsedResume> {
  const result = await mammoth.convertToHtml({ buffer });
  return parseHtmlToResume(result.value);
}

const SECTION_HEADER_REGEX = /^(EDUCATION|EXPERIENCE|PROFESSIONAL EXPERIENCE|WORK EXPERIENCE|PROJECTS|PROJECTS\s*&\s*OUTSIDE EXPERIENCE|SKILLS|TECHNICAL SKILLS|CONTACT)\s*$/im;

function splitBySectionHeaders(fullText: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = [];
  const lines = fullText.split(/\n/);
  let currentTitle = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (SECTION_HEADER_REGEX.test(trimmed)) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentContent.join("\n").trim() });
      }
      currentTitle = trimmed;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentContent.join("\n").trim() });
  }
  return sections;
}

function parseHtmlToResume(html: string): ParsedResume {
  const resume: ParsedResume = {
    contact: {},
    education: [],
    experience: [],
    projects: [],
    skills: [],
    otherSections: {},
  };

  const fullText = stripHtml(html);
  const blocks = html.split(/(?=<(?:h[1-3]|p)[^>]*>)/gi).filter(Boolean);
  const sectionTitleRegex = /^<(?:h[1-3]|p)[^>]*>([^<]*)<\//i;
  let currentTitle = "";
  let currentContent: string[] = [];
  const sections: { title: string; content: string }[] = [];

  for (const block of blocks) {
    const titleMatch = block.match(sectionTitleRegex);
    if (titleMatch) {
      const rawTitle = stripHtml(titleMatch[1]);
      const possibleTitle = rawTitle.trim();
      const looksLikeHeader =
        possibleTitle.length < 80 &&
        (SECTION_NAMES.some((s) => normalizeSectionTitle(possibleTitle).includes(s)) ||
          /^[A-Z\s&]+$/i.test(possibleTitle.replace(/\s/g, "")));
      if (looksLikeHeader) {
        if (currentTitle) {
          sections.push({ title: currentTitle, content: currentContent.join("\n").trim() });
        }
        currentTitle = possibleTitle;
        currentContent = [];
        const rest = block.replace(sectionTitleRegex, "");
        currentContent.push(stripHtml(rest));
        continue;
      }
    }
    currentContent.push(stripHtml(block));
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentContent.join("\n").trim() });
  }

  if (sections.length === 0) {
    const byHeaders = splitBySectionHeaders(fullText);
    if (byHeaders.length > 0) {
      for (const { title, content } of byHeaders) {
        const key = normalizeSectionTitle(title);
        if (key.includes("education")) resume.education = parseEducationBlock(content);
        else if (key.includes("experience") || key.includes("professional") || key.includes("work"))
          resume.experience = parseExperienceBlock(content);
        else if (key.includes("project")) resume.projects = parseProjectsBlock(content);
        else if (key.includes("skill")) resume.skills = parseSkillsBlock(content);
        else if (key.includes("contact") || key === "") resume.contact = parseContactBlock(content);
        else {
          resume.otherSections = resume.otherSections ?? {};
          resume.otherSections[title] = content;
        }
      }
      const topLines = fullText.split(/\n/).slice(0, 6).join("\n");
      if (!resume.contact.name && !resume.contact.email) resume.contact = parseContactBlock(topLines);
      return resume;
    }
    resume.contact = parseContactBlock(fullText.split(/\n/).slice(0, 6).join("\n"));
    resume.otherSections = { "Full text": fullText };
    return resume;
  }

  for (const { title, content } of sections) {
    const key = normalizeSectionTitle(title);
    if (key.includes("contact") || key.includes("name") || key === "") {
      resume.contact = { ...resume.contact, ...parseContactBlock(content) };
      if (content.trim().length > 0 && !resume.contact.name) {
        const firstLine = content.split(/\n/)[0]?.trim();
        if (firstLine && firstLine.length < 80) resume.contact.name = firstLine;
      }
    } else if (key.includes("education")) {
      resume.education = parseEducationBlock(content);
    } else if (key.includes("experience") || key.includes("professional") || key.includes("work")) {
      resume.experience = parseExperienceBlock(content);
    } else if (key.includes("project")) {
      resume.projects = parseProjectsBlock(content);
    } else if (key.includes("skill")) {
      resume.skills = parseSkillsBlock(content);
    } else {
      resume.otherSections = resume.otherSections ?? {};
      resume.otherSections[title] = content;
    }
  }

  const missingStructured =
    resume.education.length === 0 ||
    resume.experience.length === 0 ||
    resume.skills.length === 0;
  if (missingStructured) {
    const byHeaders = splitBySectionHeaders(fullText);
    for (const { title, content } of byHeaders) {
      const key = normalizeSectionTitle(title);
      if (key.includes("education") && resume.education.length === 0)
        resume.education = parseEducationBlock(content);
      else if (
        (key.includes("experience") || key.includes("professional") || key.includes("work")) &&
        resume.experience.length === 0
      )
        resume.experience = parseExperienceBlock(content);
      else if (key.includes("project") && resume.projects.length === 0)
        resume.projects = parseProjectsBlock(content);
      else if (key.includes("skill") && resume.skills.length === 0)
        resume.skills = parseSkillsBlock(content);
      else if ((key === "" || key.includes("contact")) && !resume.contact.email)
        resume.contact = { ...resume.contact, ...parseContactBlock(content) };
    }
    if (!resume.contact.name && !resume.contact.email) {
      const topLines = fullText.split(/\n/).slice(0, 8).join("\n");
      resume.contact = { ...resume.contact, ...parseContactBlock(topLines) };
    }
  }

  return resume;
}
