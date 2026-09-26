// src/config.ts
import Sqlite from "better-sqlite3";

export const MAX_PER_BUY = 5;
export const MIN_INTERVAL_SEC = 8;
export const MIN_SITE_INTERVAL_SEC = 15;

function conn(dbPath: string): Sqlite.Database {
  const sql = new Sqlite(dbPath);
  sql.exec(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts(handle TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS projects(name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS sources(
      project TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL,
      last_seen TEXT, last_hash TEXT, last_change_at TEXT,
      PRIMARY KEY(project, kind, value));`);
  return sql;
}

function get(dbPath: string, key: string): string | null {
  const sql = conn(dbPath);
  try {
    const r = sql.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return r ? r.value : null;
  } finally {
    sql.close();
  }
}

function set(dbPath: string, key: string, value: string): void {
  const sql = conn(dbPath);
  try {
    sql.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").run(key, value);
  } finally {
    sql.close();
  }
}

const norm = (h: string) => (h.startsWith("@") ? h.toLowerCase() : "@" + h.toLowerCase());

export function getAmount(dbPath: string): number {
  return Number(get(dbPath, "amount") ?? 1);
}
export function setAmount(dbPath: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0 || v > MAX_PER_BUY) throw new Error(`amount must be 1–${MAX_PER_BUY}`);
  set(dbPath, "amount", String(v));
}
export function getIntervalSec(dbPath: string): number {
  return Number(get(dbPath, "interval") ?? 12);
}
export function setIntervalSec(dbPath: string, v: number): void {
  if (!Number.isInteger(v) || v < MIN_INTERVAL_SEC) throw new Error(`interval min ${MIN_INTERVAL_SEC}s`);
  set(dbPath, "interval", String(v));
}
export function isEnabled(dbPath: string): boolean {
  return (get(dbPath, "enabled") ?? "1") === "1";
}
export function setEnabled(dbPath: string, on: boolean): void {
  set(dbPath, "enabled", on ? "1" : "0");
}
export function addAccount(dbPath: string, handle: string): void {
  // Legacy entry: becomes project "<handle>" with one x source.
  addProject(dbPath, handle.replace(/^@/, ""));
  attachSource(dbPath, handle.replace(/^@/, ""), norm(handle));
}
export function removeAccount(dbPath: string, handle: string): void {
  const sql = conn(dbPath);
  try {
    sql.prepare("DELETE FROM sources WHERE kind='x' AND value=?").run(norm(handle));
    sql.prepare("DELETE FROM projects WHERE name NOT IN (SELECT project FROM sources)").run();
  } finally {
    sql.close();
  }
}
export function listAccounts(dbPath: string): string[] {
  const sql = conn(dbPath);
  try {
    return (sql.prepare("SELECT value FROM sources WHERE kind='x' ORDER BY value").all() as { value: string }[])
      .map((r) => r.value);
  } finally {
    sql.close();
  }
}

export type SourceKind = "x" | "site";
export interface ProjectSource { kind: SourceKind; value: string; lastSeen: string | null }

const projNorm = (n: string) => n.trim().toLowerCase().replace(/^@/, "");

export function addProject(dbPath: string, name: string): void {
  const n = projNorm(name);
  if (!n) throw new Error("project name required");
  const sql = conn(dbPath);
  try {
    sql.prepare("INSERT OR IGNORE INTO projects(name) VALUES(?)").run(n);
  } finally {
    sql.close();
  }
}
export function removeProject(dbPath: string, name: string): void {
  const sql = conn(dbPath);
  try {
    sql.prepare("DELETE FROM sources WHERE project=?").run(projNorm(name));
    sql.prepare("DELETE FROM projects WHERE name=?").run(projNorm(name));
  } finally {
    sql.close();
  }
}
export function listProjects(dbPath: string): string[] {
  const sql = conn(dbPath);
  try {
    return (sql.prepare("SELECT name FROM projects ORDER BY name").all() as { name: string }[])
      .map((r) => r.name);
  } finally {
    sql.close();
  }
}
export function attachSource(dbPath: string, name: string, raw: string): SourceKind {
  const n = projNorm(name);
  const v = raw.trim();
  if (!v) throw new Error("source required");
  const kind: SourceKind = /^https?:\/\//i.test(v) ? "site" : "x";
  const value = kind === "x" ? norm(v) : v.toLowerCase();
  const sql = conn(dbPath);
  try {
    sql.prepare("INSERT OR IGNORE INTO projects(name) VALUES(?)").run(n);
    sql.prepare("INSERT OR IGNORE INTO sources(project,kind,value) VALUES(?,?,?)").run(n, kind, value);
  } finally {
    sql.close();
  }
  return kind;
}
export function detachSource(dbPath: string, name: string, raw: string): void {
  const n = projNorm(name);
  const v = raw.trim();
  const kind: SourceKind = /^https?:\/\//i.test(v) ? "site" : "x";
  const value = kind === "x" ? norm(v) : v.toLowerCase();
  const sql = conn(dbPath);
  try {
    sql.prepare("DELETE FROM sources WHERE project=? AND kind=? AND value=?").run(n, kind, value);
    sql.prepare("DELETE FROM projects WHERE name NOT IN (SELECT project FROM sources)").run();
  } finally {
    sql.close();
  }
}
export function projectSources(dbPath: string, name: string): ProjectSource[] {
  const sql = conn(dbPath);
  try {
    return sql.prepare(
      "SELECT kind, value, last_seen AS lastSeen FROM sources WHERE project=? ORDER BY kind, value"
    ).all(projNorm(name)) as ProjectSource[];
  } finally {
    sql.close();
  }
}
export function getSiteIntervalSec(dbPath: string): number {
  return Number(get(dbPath, "site_interval") ?? 30);
}
export function setSiteIntervalSec(dbPath: string, v: number): void {
  if (!Number.isInteger(v) || v < MIN_SITE_INTERVAL_SEC) throw new Error(`site interval min ${MIN_SITE_INTERVAL_SEC}s`);
  set(dbPath, "site_interval", String(v));
}
export function projectOfSource(dbPath: string, kind: SourceKind, value: string): string | null {
  const sql = conn(dbPath);
  try {
    const r = sql.prepare("SELECT project FROM sources WHERE kind=? AND value=?").get(kind, value) as
      | { project: string }
      | undefined;
    return r ? r.project : null;
  } finally {
    sql.close();
  }
}
