import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { getResume } from "@/lib/db";
import { buildResumeDocx } from "@/lib/docx-export";
import { buildTemplatePayload, populateTemplate } from "@/lib/template-populate";

const TEMPLATE_PATH = path.join(process.cwd(), "public", "template.docx");

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const resumeId = searchParams.get("resumeId") ?? "default";
    const data = await getResume(resumeId);
    if (!data) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    let buffer: Buffer;
    try {
      const templateBuffer = await fs.readFile(TEMPLATE_PATH);
      const payload = buildTemplatePayload(data.parsed, data.optimized);
      buffer = await populateTemplate(templateBuffer, payload);
    } catch {
      buffer = await buildResumeDocx(data.parsed, data.optimized);
    }

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="resume-optimized.docx"',
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
