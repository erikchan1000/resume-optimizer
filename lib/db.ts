import path from "path";
import fs from "fs/promises";
import duckdb from "duckdb";
import type { ParsedResume } from "./types";
import { DEFAULT_RESUME_ID } from "./types";

/** Derive resume primary key from parsed phone (digits only). Same phone => same id => override. No phone => default. */
export function resumeIdFromPhone(phone: string | undefined): string {
  if (!phone || typeof phone !== "string") return DEFAULT_RESUME_ID;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits : DEFAULT_RESUME_ID;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "resume.duckdb");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

type Connection = duckdb.Connection;

let db: duckdb.Database | null = null;
let connection: Connection | null = null;
let initPromise: Promise<Connection> | null = null;

function runAsync(con: Connection, sql: string, ...params: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    con.run(sql, ...params, (err: duckdb.DuckDbError | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function allAsync(con: Connection, sql: string, ...params: unknown[]): Promise<duckdb.RowData[]> {
  return new Promise((resolve, reject) => {
    con.all(sql, ...params, (err: duckdb.DuckDbError | null, rows: duckdb.TableData) => {
      if (err) reject(err);
      else resolve(rows ?? []);
    });
  });
}

async function getConnection(): Promise<Connection> {
  if (connection) return connection;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    const dbInstance = await new Promise<duckdb.Database>((resolve, reject) => {
      const d = new duckdb.Database(DB_PATH, (err: duckdb.DuckDbError | null) => {
        if (err) reject(err);
        else resolve(d);
      });
    });
    db = dbInstance;
    connection = db.connect();
    return connection;
  })();
  return initPromise;
}

export async function init(): Promise<void> {
  const con = await getConnection();
  await runAsync(
    con,
    `CREATE TABLE IF NOT EXISTS resumes (
      id VARCHAR PRIMARY KEY,
      file_path VARCHAR,
      parsed_json VARCHAR,
      optimized_json VARCHAR,
      created_at TIMESTAMP DEFAULT now()
    )`
  );
}

export interface StoredResumeRow {
  id: string;
  file_path: string | null;
  parsed_json: string;
  optimized_json: string | null;
  created_at: string;
}

export async function saveResume(
  id: string,
  data: { parsed: ParsedResume; filePath?: string }
): Promise<void> {
  await init();
  const con = await getConnection();
  const parsedJson = JSON.stringify(data.parsed);
  const filePath = data.filePath ?? null;
  await runAsync(
    con,
    `INSERT INTO resumes (id, file_path, parsed_json, created_at)
     VALUES (?, ?, ?, now())
     ON CONFLICT (id) DO UPDATE SET
       file_path = EXCLUDED.file_path,
       parsed_json = EXCLUDED.parsed_json,
       created_at = now()`,
    id,
    filePath,
    parsedJson
  );
}

export async function getResume(
  id: string
): Promise<{ parsed: ParsedResume; filePath: string | null; optimized?: ParsedResume } | null> {
  await init();
  const con = await getConnection();
  const rows = await allAsync(con, "SELECT id, file_path, parsed_json, optimized_json FROM resumes WHERE id = ?", id);
  if (rows.length === 0) return null;
  const row = rows[0] as unknown as StoredResumeRow;
  const parsed = JSON.parse(row.parsed_json) as ParsedResume;
  const result: { parsed: ParsedResume; filePath: string | null; optimized?: ParsedResume } = {
    parsed,
    filePath: row.file_path,
  };
  if (row.optimized_json) {
    result.optimized = JSON.parse(row.optimized_json) as ParsedResume;
  }
  return result;
}

export async function saveOptimized(id: string, optimized: ParsedResume): Promise<void> {
  await init();
  const con = await getConnection();
  const optimizedJson = JSON.stringify(optimized);
  await runAsync(con, "UPDATE resumes SET optimized_json = ? WHERE id = ?", optimizedJson, id);
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}

export { DEFAULT_RESUME_ID };
