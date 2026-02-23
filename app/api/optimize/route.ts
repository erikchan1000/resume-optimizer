import { NextResponse } from "next/server";
import { getResume, saveOptimized } from "@/lib/db";
import { optimizeResumeWithLLM, isLLMConfigured } from "@/lib/llm";
import type {
  OptimizedSections,
  ParsedResume,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
} from "@/lib/types";

export async function POST(request: Request) {
  try {
    if (!isLLMConfigured()) {
      return NextResponse.json(
        {
          error:
            "No LLM API key set. Add one of OPENAI_API_KEY, MOONSHOT_API_KEY, or OPENROUTER_API_KEY to .env or .env.local.",
        },
        { status: 503 }
      );
    }
    const body = await request.json();
    const resumeId = (body.resumeId as string) ?? "default";
    const jobDescription = (body.jobDescription as string) ?? "";
    const missingKeywords = body.missingKeywords as string[] | undefined;
    if (!jobDescription.trim()) {
      return NextResponse.json({ error: "Job description is required" }, { status: 400 });
    }
    const data = await getResume(resumeId);
    if (!data) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }
    const result = await optimizeResumeWithLLM(
      data.parsed,
      jobDescription,
      missingKeywords
    );
    const optimized = result.optimizedSections as OptimizedSections;
    const merged = mergeOptimizedIntoResume(data.parsed, optimized);
    await saveOptimized(resumeId, merged);
    return NextResponse.json({ ...result, parsed: merged });
  } catch (err) {
    console.error("Optimize error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Optimization failed" },
      { status: 500 }
    );
  }
}

function mergeOptimizedIntoResume(parsed: ParsedResume, optimized: OptimizedSections): ParsedResume {
  const education: EducationEntry[] =
    optimized.education?.length ? optimized.education : parsed.education;
  const experience: ExperienceEntry[] = optimized.experience?.length
    ? optimized.experience.map((e, idx) => {
        const orig = parsed.experience[idx];
        return {
          company: e.company,
          role: e.role,
          location: orig?.location,
          dates: orig?.dates,
          subheader: e.subheader ?? orig?.subheader,
          bullets: e.bullets ?? [],
        };
      })
    : parsed.experience;
  const skills = optimized.skills?.length ? optimized.skills : parsed.skills;
  const projects: ProjectEntry[] = optimized.projects?.length
    ? optimized.projects.map((p, idx) => ({
        title: p.title ?? parsed.projects[idx]?.title,
        bullets: p.bullets ?? [],
      }))
    : parsed.projects;
  return {
    contact: optimized.contact ?? parsed.contact,
    education,
    experience,
    projects,
    skills,
    otherSections: parsed.otherSections,
  };
}
