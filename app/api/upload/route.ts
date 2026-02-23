import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { parseResumeFromBuffer } from "@/lib/resume-parser";
import { init, saveResume, getUploadsDir, resumeIdFromPhone } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const name = file.name?.toLowerCase() ?? "";
    if (!name.endsWith(".docx")) {
      return NextResponse.json({ error: "File must be a .docx document" }, { status: 400 });
    }
    await init();
    const uploadsDir = getUploadsDir();
    const id = randomUUID();
    const safeName = `${id}-${path.basename(file.name)}`;
    const filePath = path.join(uploadsDir, safeName);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(filePath, buffer);
    const parsed = await parseResumeFromBuffer(buffer);
    const resumeId = resumeIdFromPhone(parsed.contact?.phone);
    await saveResume(resumeId, { parsed, filePath });
    return NextResponse.json({
      success: true,
      resumeId,
      parsed,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
