# Resume Optimizer

A Next.js app that lets you upload a resume (docx), parse it, compare with job descriptions for missing keywords, and export an ATS-optimized version.

## Setup

1. Install dependencies: `npm install`
2. (Optional) Copy `.env.example` to `.env` or `.env.local` and set **one** LLM API key to enable keyword extraction (LLM) and **Optimize for this job**:
   - `OPENAI_API_KEY` — OpenAI (e.g. gpt-4o-mini)
   - `MOONSHOT_API_KEY` — Moonshot / Kimi K2 ([console](https://platform.moonshot.ai/console/api-keys))
   - `OPENROUTER_API_KEY` — OpenRouter ([keys](https://openrouter.ai/keys)); supports Kimi K2 and others
3. Run the dev server: `npm run dev`

## Usage

1. **Upload** a `.docx` resume. It is saved under `data/uploads/` and parsed into structured data stored in a local SQLite DB (`data/resume.sqlite`).
2. **Preview** the parsed sections (contact, education, experience, projects, skills).
3. **Paste a job description** and click **Analyze keywords** to see missing vs matched keywords. By default this uses word-level tokenization. Check **Use LLM to extract keywords** to get phrase-aware keywords (e.g. "data structures", "financial markets", "growth mindset") and to exclude the company name; requires `OPENAI_API_KEY`.
4. (Optional) Click **Optimize for this job (LLM)** to get suggested bullet/keyword edits (requires one of the LLM API keys above). Missing keywords from the analyze step are passed to the LLM to weave in.
5. **Download resume (.docx)** to get the current resume as a docx file (includes optimizations if you ran Optimize).

## Data

- Uploads: `data/uploads/`
- Database: `data/resume.duckdb` (DuckDB, created on first use)
- Template: `public/template.docx` — Same styling and layout as your resume (built from your resume file). Run `npm run generate-template` to (re)generate it from `Erik_Chan_resume (1).docx` (or set `RESUME_SOURCE_PATH`). The script replaces content with `{{fieldName}}` placeholders; export fills them from parsed/optimized data, or falls back to programmatic docx build if the template is missing.

## Keyword detection

- **Default (word-level)**: Job description is tokenized into single words (length > 2); each token is checked against the resume text. Multi-word phrases like "data structures" or "financial markets" are not detected as single keywords.
- **LLM extraction** (optional): When "Use LLM to extract keywords" is checked and an LLM API key is set, the app asks the LLM to extract important keywords and phrases from the job description (including multi-word phrases), then checks each against the resume. The extraction prompt instructs the LLM not to include the hiring company name (e.g. Kalshi) in the keyword list.

## Testing

Tests use **Vitest**. Use Node 20 (e.g. `nvm use 20` or `nvm use` with the project’s `.nvmrc`), then:

- `npm run test` — run all tests once  
- `npm run test:watch` — watch mode  

## Tech

- **Next.js 15** (App Router), **Tailwind 4**, **TypeScript**
- **mammoth** – parse docx to HTML then to structured resume data
- **sql.js** – local SQLite for storing parsed (and optimized) resume
- **docx** – generate the exported .docx file
- **OpenAI** – optional LLM step for keyword insertion and bullet suggestions
