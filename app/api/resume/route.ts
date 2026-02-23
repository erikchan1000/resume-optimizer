import { NextResponse } from "next/server";
import { getResume, saveResume } from "@/lib/db";
import type { ParsedResume } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") ?? "default";
    const data = await getResume(id);
    if (!data) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }
    return NextResponse.json({
      parsed: data.parsed,
      filePath: data.filePath,
      optimized: data.optimized,
    });
  } catch (err) {
    console.error("Get resume error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load resume" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = (body.id as string) ?? (body.resumeId as string) ?? "default";
    const parsed = body.parsed as ParsedResume | undefined;
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ error: "parsed resume object is required" }, { status: 400 });
    }
    const existing = await getResume(id);
    await saveResume(id, {
      parsed,
      filePath: existing?.filePath ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Update resume error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save resume" },
      { status: 500 }
    );
  }
}
