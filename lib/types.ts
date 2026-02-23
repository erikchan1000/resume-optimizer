/**
 * Shared types for parsed resume data and API payloads.
 */

export interface Contact {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
}

export interface EducationEntry {
  school?: string;
  degree?: string;
  dates?: string;
  gpa?: string;
  rawText?: string;
}

export interface ExperienceEntry {
  company?: string;
  role?: string;
  location?: string;
  dates?: string;
  /** Optional subheader line (e.g. tech stack: "AWS Lambda, AWS Redshift, Node.js, React, ...") */
  subheader?: string;
  bullets: string[];
}

export interface ProjectEntry {
  title?: string;
  bullets: string[];
}

export interface ParsedResume {
  contact: Contact;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  skills: string[];
  /** Raw section title → content for unmapped sections */
  otherSections?: Record<string, string>;
}

export const DEFAULT_RESUME_ID = "default";

export interface AnalyzeResponse {
  missingKeywords: string[];
  matchedKeywords: string[];
  suggestions?: string[];
}

export interface OptimizedSections {
  experience?: { company?: string; role?: string; subheader?: string; bullets: string[] }[];
  education?: EducationEntry[];
  projects?: { title?: string; bullets: string[] }[];
  skills?: string[];
  /** Optional revised contact/headline */
  contact?: Contact;
}

export interface OptimizeResponse {
  optimizedSections: OptimizedSections;
  fullText?: string;
}
