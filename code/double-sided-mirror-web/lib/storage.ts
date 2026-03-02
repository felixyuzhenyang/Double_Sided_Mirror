import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { RuntimeDb } from "./types";

const projectDataDir = join(process.cwd(), "data");
const dataDir =
  process.env.DSM_DATA_DIR ||
  (process.env.VERCEL ? join("/tmp", "double-sided-mirror-data") : projectDataDir);
const dbPath = join(dataDir, "runtime-db.json");
const seedDbPath = join(projectDataDir, "runtime-db.json");

const EMPTY_DB: RuntimeDb = {
  sessions: [],
  cases: [],
  responses: [],
  auditEvents: []
};

let memoryDb: RuntimeDb | null = null;

function cloneDb(db: RuntimeDb): RuntimeDb {
  return JSON.parse(JSON.stringify(db)) as RuntimeDb;
}

function normalizedDb(parsed: Partial<RuntimeDb>): RuntimeDb {
  return {
    sessions: parsed.sessions ?? [],
    cases: parsed.cases ?? [],
    responses: parsed.responses ?? [],
    auditEvents: parsed.auditEvents ?? []
  };
}

function readMemoryDb(): RuntimeDb {
  if (!memoryDb) {
    memoryDb = cloneDb(EMPTY_DB);
  }
  return cloneDb(memoryDb);
}

function writeMemoryDb(db: RuntimeDb): void {
  memoryDb = cloneDb(db);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function ensureDbFile(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(dbPath, "utf-8");
    return;
  } catch {
    try {
      const seedRaw = await readFile(seedDbPath, "utf-8");
      await writeFile(dbPath, seedRaw, "utf-8");
    } catch {
      await writeFile(dbPath, JSON.stringify(EMPTY_DB, null, 2), "utf-8");
    }
  }
}

export async function readDb(): Promise<RuntimeDb> {
  try {
    await ensureDbFile();
    const raw = await readFile(dbPath, "utf-8");
    const parsed = normalizedDb(JSON.parse(raw) as Partial<RuntimeDb>);
    writeMemoryDb(parsed);
    return parsed;
  } catch {
    return readMemoryDb();
  }
}

export async function writeDb(db: RuntimeDb): Promise<void> {
  const nextDb = normalizedDb(db);
  writeMemoryDb(nextDb);
  try {
    await ensureDbFile();
    await writeFile(dbPath, JSON.stringify(nextDb, null, 2), "utf-8");
  } catch {
    // Vercel or restricted runtimes may block filesystem writes; keep in-memory state as fallback.
  }
}
