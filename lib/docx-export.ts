import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import type {
  ParsedResume,
  OptimizedSections,
  ExperienceEntry,
} from "./types";

const spacingAfter = (points: number) => ({ spacing: { after: points } });

export async function buildResumeDocx(
  parsed: ParsedResume,
  optimized?: OptimizedSections | null
): Promise<Buffer> {
  const education = optimized?.education ?? parsed.education;
  const skills = optimized?.skills ?? parsed.skills;
  const contact = optimized?.contact ?? parsed.contact;
  const experience: ExperienceEntry[] =
    optimized?.experience?.length ?
      optimized.experience.map((e, i) => ({
        ...parsed.experience[i],
        company: e.company,
        role: e.role,
        subheader: e.subheader ?? parsed.experience[i]?.subheader,
        bullets: e.bullets ?? [],
      }))
    : parsed.experience;

  const children: Paragraph[] = [];

  // Name / title
  children.push(
    new Paragraph({
      text: (contact.name ?? "Resume").toUpperCase(),
      heading: HeadingLevel.TITLE,
      ...spacingAfter(120),
    })
  );
  const contactStr = [
    contact.phone,
    contact.email,
    contact.location,
    contact.linkedin,
  ]
    .filter(Boolean)
    .join("  |  ");
  if (contactStr) {
    children.push(
      new Paragraph({
        children: [new TextRun(contactStr)],
        ...spacingAfter(240),
      })
    );
  }

  // Education
  if (education.length > 0) {
    children.push(
      new Paragraph({
        text: "EDUCATION",
        heading: HeadingLevel.HEADING_1,
        ...spacingAfter(120),
      })
    );
    for (const e of education) {
      const line = e.rawText ?? [e.school, e.degree, e.dates, e.gpa].filter(Boolean).join(" – ");
      if (line) {
        children.push(new Paragraph({ text: line, ...spacingAfter(60) }));
      }
      if (e.dates && !e.rawText) {
        children.push(new Paragraph({ text: e.dates, ...spacingAfter(120) }));
      }
    }
  }

  // Experience
  if (experience.length > 0) {
    children.push(
      new Paragraph({
        text: "PROFESSIONAL EXPERIENCE",
        heading: HeadingLevel.HEADING_1,
        ...spacingAfter(120),
      })
    );
    for (const exp of experience) {
      const header = [exp.company, exp.location, exp.dates]
        .filter(Boolean)
        .join("  |  ");
      if (header) {
        children.push(new Paragraph({ text: header, ...spacingAfter(60) }));
      }
      const roleLine = [exp.role, exp.subheader]
        .filter(Boolean)
        .join("  |  ");
      if (roleLine) {
        children.push(new Paragraph({ text: roleLine, ...spacingAfter(120) }));
      }
      for (const bullet of exp.bullets ?? []) {
        children.push(
          new Paragraph({
            children: [new TextRun(`• ${bullet}`)],
            ...spacingAfter(60),
          })
        );
      }
      children.push(new Paragraph({ text: "", ...spacingAfter(60) }));
    }
  }

  // Projects
  if (parsed.projects.length > 0) {
    children.push(
      new Paragraph({
        text: "PROJECTS & OUTSIDE EXPERIENCE",
        heading: HeadingLevel.HEADING_1,
        ...spacingAfter(120),
      })
    );
    for (const proj of parsed.projects) {
      if (proj.title) {
        children.push(new Paragraph({ text: proj.title, ...spacingAfter(60) }));
      }
      for (const bullet of proj.bullets ?? []) {
        children.push(
          new Paragraph({
            children: [new TextRun(`• ${bullet}`)],
            ...spacingAfter(60),
          })
        );
      }
      children.push(new Paragraph({ text: "", ...spacingAfter(120) }));
    }
  }

  // Skills
  if (skills.length > 0) {
    children.push(
      new Paragraph({
        text: "SKILLS",
        heading: HeadingLevel.HEADING_1,
        ...spacingAfter(120),
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun(skills.join(", "))],
      })
    );
  }

  const doc = new Document({
    sections: [{ children }],
  });
  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
