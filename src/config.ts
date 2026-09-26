// src/config.ts
import Sqlite from "better-sqlite3";

export const MAX_PER_BUY = 5;
export const MIN_INTERVAL_SEC = 8;

function conn(dbPath: string): Sqlite.Database {
  const sql = new Sqlite(dbPath);
  sql.exec(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts(handle TEXT PRIMARY KEY);`);
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
  const sql = conn(dbPath);
  try {
    sql.prepare("INSERT OR IGNORE INTO accounts(handle) VALUES(?)").run(norm(handle));
  } finally {
    sql.close();
  }
}
export function removeAccount(dbPath: string, handle: string): void {
  const sql = conn(dbPath);
  try {
    sql.prepare("DELETE FROM accounts WHERE handle = ?").run(norm(handle));
  } finally {
    sql.close();
  }
}
export function listAccounts(dbPath: string): string[] {
  const sql = conn(dbPath);
  try {
    return (sql.prepare("SELECT handle FROM accounts ORDER BY handle").all() as { handle: string }[])
      .map((r) => r.handle);
  } finally {
    sql.close();
  }
}
