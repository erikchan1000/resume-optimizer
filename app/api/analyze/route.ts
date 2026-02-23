import { NextResponse } from "next/server";
import { getResume } from "@/lib/db";
import { compareKeywords, compareKeywordList } from "@/lib/analyze";
import { extractKeywordsWithLLM, isLLMConfigured } from "@/lib/llm";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const resumeId = (body.resumeId as string) ?? "default";
    const jobDescription = (body.jobDescription as string) ?? "";
    const useLLMExtraction = body.useLLMExtraction === true;
    if (!jobDescription.trim()) {
      return NextResponse.json({ error: "Job description is required" }, { status: 400 });
    }
    const data = await getResume(resumeId);
    if (!data) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }
    if (useLLMExtraction && isLLMConfigured()) {
      const keywords = await extractKeywordsWithLLM(jobDescription);
      const result = compareKeywordList(data.parsed, keywords);
      return NextResponse.json(result);
    }
    const result = compareKeywords(data.parsed, jobDescription);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
