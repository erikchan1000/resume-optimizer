"use client";

import { useState, useCallback } from "react";
import type { ParsedResume, AnalyzeResponse } from "@/lib/types";

export default function Home() {
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [savingResume, setSavingResume] = useState(false);
  const [saveResumeError, setSaveResumeError] = useState<string | null>(null);

  const updateParsed = useCallback((updater: (prev: ParsedResume) => ParsedResume) => {
    setParsed((prev) => (prev ? updater(prev) : null));
  }, []);

  const handleSaveResume = useCallback(async () => {
    if (!parsed) return;
    setSaveResumeError(null);
    setSavingResume(true);
    try {
      const res = await fetch("/api/resume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resumeId ?? "default", parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
    } catch (err) {
      setSaveResumeError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingResume(false);
    }
  }, [parsed, resumeId]);

  const handleUpload = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.querySelector('input[type="file"]') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file) {
      setUploadError("Please select a .docx file");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResumeId((data.resumeId as string) ?? null);
      setParsed(data.parsed);
      setAnalysis(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!jobDescription.trim()) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: resumeId ?? "default",
          jobDescription,
          useLLMExtraction: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setAnalysis(data);
    } catch {
      setAnalysis({ missingKeywords: [], matchedKeywords: [], suggestions: [] });
    } finally {
      setAnalyzing(false);
    }
  }, [jobDescription, resumeId]);

  const handleOptimize = useCallback(async () => {
    if (!jobDescription.trim()) return;
    setOptimizeError(null);
    setOptimizing(true);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: resumeId ?? "default",
          jobDescription,
          missingKeywords: analysis?.missingKeywords,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Optimization failed");
      setOptimizeError(null);
      if (data.parsed) setParsed(data.parsed as ParsedResume);
    } catch (err) {
      setOptimizeError(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setOptimizing(false);
    }
  }, [jobDescription, analysis?.missingKeywords, resumeId]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/export?resumeId=${resumeId ?? "default"}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resume-optimized.docx";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [resumeId]);

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Resume Optimizer</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Upload your resume, paste a job description, and get an ATS-friendly version.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">1. Upload resume (.docx)</h2>
        <form onSubmit={handleUpload} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".docx"
            className="block text-sm file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-neutral-200 file:text-neutral-800 dark:file:bg-neutral-700 dark:file:text-neutral-200"
          />
          <button
            type="submit"
            disabled={uploading}
            className="rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
        {uploadError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{uploadError}</p>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Sample template: <a href="/template.docx" className="underline">template.docx</a>
        </p>
      </section>

      {parsed && (
        <section className="mb-8 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-medium">2. Parsed resume (edit if needed)</h2>
            <button
              type="button"
              onClick={handleSaveResume}
              disabled={savingResume}
              className="rounded-md bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {savingResume ? "Saving…" : "Save changes"}
            </button>
          </div>
          {saveResumeError && (
            <p className="mb-3 text-sm text-red-600 dark:text-red-400">{saveResumeError}</p>
          )}
          <div className="grid gap-4 text-sm">
            <div>
              <h3 className="font-medium text-foreground block mb-2">Contact</h3>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                <label className="block">
                  <span className="text-neutral-500 text-xs block mb-0.5">Name</span>
                <input
                  type="text"
                  placeholder="Full name"
                  value={parsed.contact?.name ?? ""}
                  onChange={(e) => updateParsed((p) => ({ ...p, contact: { ...p.contact, name: e.target.value } }))}
                  className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                />
                </label>
                <label className="block">
                  <span className="text-neutral-500 text-xs block mb-0.5">Email</span>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={parsed.contact?.email ?? ""}
                  onChange={(e) => updateParsed((p) => ({ ...p, contact: { ...p.contact, email: e.target.value } }))}
                  className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                />
                </label>
                <label className="block">
                  <span className="text-neutral-500 text-xs block mb-0.5">Phone</span>
                <input
                  type="text"
                  placeholder="Phone number"
                  value={parsed.contact?.phone ?? ""}
                  onChange={(e) => updateParsed((p) => ({ ...p, contact: { ...p.contact, phone: e.target.value } }))}
                  className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                />
                </label>
                <label className="block">
                  <span className="text-neutral-500 text-xs block mb-0.5">Location</span>
                <input
                  type="text"
                  placeholder="City, State"
                  value={parsed.contact?.location ?? ""}
                  onChange={(e) => updateParsed((p) => ({ ...p, contact: { ...p.contact, location: e.target.value } }))}
                  className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-neutral-500 text-xs block mb-0.5">LinkedIn URL</span>
                <input
                  type="text"
                  placeholder="https://linkedin.com/in/..."
                  value={parsed.contact?.linkedin ?? ""}
                  onChange={(e) => updateParsed((p) => ({ ...p, contact: { ...p.contact, linkedin: e.target.value } }))}
                  className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                />
                </label>
              </div>
            </div>

            {parsed.education && parsed.education.length > 0 && (
              <div>
                <h3 className="font-medium text-foreground block mb-2">Education</h3>
                <div className="space-y-3">
                  {parsed.education.map((e, i) => (
                    <div key={i} className="pl-2 border-l-2 border-neutral-200 dark:border-neutral-700 space-y-2">
                      <label className="block">
                        <span className="text-neutral-500 text-xs block mb-0.5">School</span>
                      <input
                        type="text"
                        placeholder="School name"
                        value={e.school ?? ""}
                        onChange={(ev) =>
                          updateParsed((p) => ({
                            ...p,
                            education: p.education.map((ent, j) => (j === i ? { ...ent, school: ev.target.value } : ent)),
                          }))
                        }
                        className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                      />
                      </label>
                      <label className="block">
                        <span className="text-neutral-500 text-xs block mb-0.5">Degree</span>
                      <input
                        type="text"
                        placeholder="Degree and major"
                        value={e.degree ?? ""}
                        onChange={(ev) =>
                          updateParsed((p) => ({
                            ...p,
                            education: p.education.map((ent, j) => (j === i ? { ...ent, degree: ev.target.value } : ent)),
                          }))
                        }
                        className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                      />
                      </label>
                      <div className="flex gap-2">
                        <label className="flex-1 block">
                          <span className="text-neutral-500 text-xs block mb-0.5">Dates</span>
                        <input
                          type="text"
                          placeholder="e.g. 2018 – 2022"
                          value={e.dates ?? ""}
                          onChange={(ev) =>
                            updateParsed((p) => ({
                              ...p,
                              education: p.education.map((ent, j) => (j === i ? { ...ent, dates: ev.target.value } : ent)),
                            }))
                          }
                          className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                        />
                        </label>
                        <label className="block w-24">
                          <span className="text-neutral-500 text-xs block mb-0.5">GPA</span>
                        <input
                          type="text"
                          placeholder="GPA"
                          value={e.gpa ?? ""}
                          onChange={(ev) =>
                            updateParsed((p) => ({
                              ...p,
                              education: p.education.map((ent, j) => (j === i ? { ...ent, gpa: ev.target.value } : ent)),
                            }))
                          }
                          className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                        />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {parsed.experience && parsed.experience.length > 0 && (
              <div>
                <h3 className="font-medium text-foreground block mb-2">Experience</h3>
                <div className="space-y-4">
                  {parsed.experience.map((exp, i) => (
                    <div key={i} className="pl-2 border-l-2 border-neutral-200 dark:border-neutral-700 space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-neutral-500 text-xs block mb-0.5">Company</span>
                        <input
                          type="text"
                          placeholder="Company name"
                          value={exp.company ?? ""}
                          onChange={(ev) =>
                            updateParsed((p) => ({
                              ...p,
                              experience: p.experience.map((ent, j) => (j === i ? { ...ent, company: ev.target.value } : ent)),
                            }))
                          }
                          className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                        />
                        </label>
                        <label className="block">
                          <span className="text-neutral-500 text-xs block mb-0.5">Role</span>
                        <input
                          type="text"
                          placeholder="Job title"
                          value={exp.role ?? ""}
                          onChange={(ev) =>
                            updateParsed((p) => ({
                              ...p,
                              experience: p.experience.map((ent, j) => (j === i ? { ...ent, role: ev.target.value } : ent)),
                            }))
                          }
                          className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                        />
                        </label>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-neutral-500 text-xs block mb-0.5">Location</span>
                        <input
                          type="text"
                          placeholder="City, State"
                          value={exp.location ?? ""}
                          onChange={(ev) =>
                            updateParsed((p) => ({
                              ...p,
                              experience: p.experience.map((ent, j) => (j === i ? { ...ent, location: ev.target.value } : ent)),
                            }))
                          }
                          className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                        />
                        </label>
                        <label className="block">
                          <span className="text-neutral-500 text-xs block mb-0.5">Dates</span>
                        <input
                          type="text"
                          placeholder="e.g. Jul 2024 – Present"
                          value={exp.dates ?? ""}
                          onChange={(ev) =>
                            updateParsed((p) => ({
                              ...p,
                              experience: p.experience.map((ent, j) => (j === i ? { ...ent, dates: ev.target.value } : ent)),
                            }))
                          }
                          className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                        />
                        </label>
                      </div>
                      <label className="block">
                        <span className="text-neutral-500 text-xs block mb-0.5">Subheader (e.g. tech stack)</span>
                        <input
                          type="text"
                          placeholder="e.g. AWS Lambda, AWS Redshift, Node.js, React, C#, Go"
                          value={exp.subheader ?? ""}
                          onChange={(ev) =>
                            updateParsed((p) => ({
                              ...p,
                              experience: p.experience.map((ent, j) => (j === i ? { ...ent, subheader: ev.target.value } : ent)),
                            }))
                          }
                          className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                        />
                      </label>
                      <div className="space-y-1">
                        <span className="text-neutral-500 text-xs block mb-0.5">Bullets</span>
                        {(exp.bullets ?? []).map((bullet, j) => (
                          <textarea
                            key={j}
                            placeholder={`Bullet ${j + 1}`}
                            value={bullet}
                            onChange={(ev) =>
                              updateParsed((p) => ({
                                ...p,
                                experience: p.experience.map((ent, ei) =>
                                  ei === i ? { ...ent, bullets: ent.bullets.map((b, bi) => (bi === j ? ev.target.value : b)) } : ent
                                ),
                              }))
                            }
                            rows={2}
                            className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 block w-full"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {parsed.projects && parsed.projects.length > 0 && (
              <div>
                <h3 className="font-medium text-foreground block mb-2">Projects</h3>
                <div className="space-y-3">
                  {parsed.projects.map((proj, i) => (
                    <div key={i} className="pl-2 border-l-2 border-neutral-200 dark:border-neutral-700 space-y-2">
                      <label className="block">
                        <span className="text-neutral-500 text-xs block mb-0.5">Project title</span>
                      <input
                        type="text"
                        placeholder="Project name"
                        value={proj.title ?? ""}
                        onChange={(ev) =>
                          updateParsed((p) => ({
                            ...p,
                            projects: p.projects.map((ent, j) => (j === i ? { ...ent, title: ev.target.value } : ent)),
                          }))
                        }
                        className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
                      />
                      </label>
                      <div className="space-y-1">
                        <span className="text-neutral-500 text-xs block mb-0.5">Bullets</span>
                        {(proj.bullets ?? []).map((bullet, j) => (
                          <textarea
                            key={j}
                            placeholder={`Bullet ${j + 1}`}
                            value={bullet}
                            onChange={(ev) =>
                              updateParsed((p) => ({
                                ...p,
                                projects: p.projects.map((ent, pi) =>
                                  pi === i ? { ...ent, bullets: ent.bullets.map((b, bi) => (bi === j ? ev.target.value : b)) } : ent
                                ),
                              }))
                            }
                            rows={2}
                            className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 block w-full"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-medium text-foreground block mb-2">Skills</h3>
              <label className="block">
                <span className="text-neutral-500 text-xs block mb-0.5">Skills (comma-separated)</span>
              <input
                type="text"
                placeholder="e.g. TypeScript, React, Node.js"
                value={Array.isArray(parsed.skills) ? parsed.skills.join(", ") : ""}
                onChange={(e) =>
                  updateParsed((p) => ({
                    ...p,
                    skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  }))
                }
                className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 w-full"
              />
              </label>
            </div>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">3. Job description</h2>
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the job description here…"
          rows={6}
          className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || !parsed}
            className="rounded-md bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : "Analyze keywords"}
          </button>
          <button
            type="button"
            onClick={handleOptimize}
            disabled={optimizing || !parsed}
            className="rounded-md border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            {optimizing ? "Optimizing…" : "Optimize for this job (LLM)"}
          </button>
        </div>
        {optimizeError && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">{optimizeError}</p>
        )}
      </section>

      {analysis && (
        <section className="mb-8 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
          <h2 className="text-lg font-medium mb-3">Keyword analysis</h2>
          <div className="grid gap-2 text-sm">
            {analysis.missingKeywords?.length > 0 && (
              <div>
                <span className="font-medium text-neutral-500">Missing in resume</span>
                <p className="mt-0.5 flex flex-wrap gap-1">
                  {analysis.missingKeywords.slice(0, 40).map((k, i) => (
                    <span key={i} className="rounded bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5">
                      {k}
                    </span>
                  ))}
                  {analysis.missingKeywords.length > 40 && (
                    <span className="text-neutral-500">+{analysis.missingKeywords.length - 40} more</span>
                  )}
                </p>
              </div>
            )}
            {analysis.matchedKeywords?.length > 0 && (
              <div>
                <span className="font-medium text-neutral-500">Matched</span>
                <p className="mt-0.5 flex flex-wrap gap-1">
                  {analysis.matchedKeywords.slice(0, 30).map((k, i) => (
                    <span key={i} className="rounded bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5">
                      {k}
                    </span>
                  ))}
                  {analysis.matchedKeywords.length > 30 && (
                    <span className="text-neutral-500">+{analysis.matchedKeywords.length - 30} more</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium mb-3">4. Download</h2>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || !parsed}
          className="rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? "Preparing…" : "Download resume (.docx)"}
        </button>
        <p className="mt-2 text-xs text-neutral-500">
          Downloads the current resume (with optimizations if you ran Optimize).
        </p>
      </section>
    </div>
  );
}
