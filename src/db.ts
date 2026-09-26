import Sqlite from "better-sqlite3";

export interface DetectionInput {
  project: string; caKey: string; caDisplay: string;
  chain: string; source: string; detectedAt: number;
}
export interface RecentDetection { source: string; detectedAt: number }

export interface Db {
  isDuplicate(tweetId: string, ca: string): boolean;
  recordBuy(tweetId: string, ca: string, amountSui: number, txHash: string): void;
  getLastSeen(handle: string): string | null;
  setLastSeen(handle: string, id: string): void;
  recordDetection(d: DetectionInput): void;
  recentDetection(project: string, caKey: string, excludeSource: string, withinMs: number): RecentDetection | null;
  close(): void;
}

/** Move legacy accounts+last_seen rows into projects/sources. Idempotent. Returns projects created. */
export function migrateDb(dbPath: string): number {
  const sql = new Sqlite(dbPath);
  try {
    sql.exec(`CREATE TABLE IF NOT EXISTS projects(name TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS sources(
        project TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL,
        last_seen TEXT, last_hash TEXT, last_change_at TEXT,
        PRIMARY KEY(project, kind, value));`);
    const has = (t: string) =>
      !!sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
    if (!has("accounts")) return 0;
    const rows = sql.prepare("SELECT handle FROM accounts").all() as { handle: string }[];
    const seen = has("last_seen")
      ? new Map(
          (sql.prepare("SELECT handle, tweet_id FROM last_seen").all() as { handle: string; tweet_id: string }[])
            .map((r) => [r.handle, r.tweet_id] as const),
        )
      : new Map<string, string>();
    let created = 0;
    for (const { handle } of rows) {
      const name = handle.replace(/^@/, "").toLowerCase();
      const ins = sql.prepare("INSERT OR IGNORE INTO projects(name) VALUES(?)").run(name);
      if (ins.changes > 0) created++;
      sql.prepare(
        "INSERT OR IGNORE INTO sources(project,kind,value,last_seen) VALUES(?,?,?,?)"
      ).run(name, "x", handle.toLowerCase(), seen.get(handle) ?? null);
    }
    return created;
  } finally {
    sql.close();
  }
}

export function initDb(path: string): Db {
  const sql = new Sqlite(path);
  sql.exec(`
    CREATE TABLE IF NOT EXISTS buys(
      tweet_id TEXT PRIMARY KEY, ca TEXT NOT NULL,
      amount_sui REAL NOT NULL, tx_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS seen_cas(ca TEXT PRIMARY KEY, seen_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS last_seen(handle TEXT PRIMARY KEY, tweet_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects(name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS sources(
      project TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL,
      last_seen TEXT, last_hash TEXT, last_change_at TEXT,
      PRIMARY KEY(project, kind, value));
    CREATE TABLE IF NOT EXISTS detections(
      project TEXT NOT NULL, ca_key TEXT NOT NULL, ca_display TEXT NOT NULL,
      chain TEXT NOT NULL, source TEXT NOT NULL, detected_at INTEGER NOT NULL,
      PRIMARY KEY(project, ca_key, source));
  `);
  const DAY = 24 * 3600 * 1000;
  return {
    isDuplicate(tweetId, ca) {
      const t = sql.prepare("SELECT 1 FROM buys WHERE tweet_id = ?").get(tweetId);
      if (t) return true;
      const c = sql
        .prepare("SELECT seen_at FROM seen_cas WHERE ca = ?")
        .get(ca) as { seen_at: string } | undefined;
      if (c && Date.now() - Date.parse(c.seen_at) < DAY) return true;
      return false;
    },
    recordBuy(tweetId, ca, amountSui, txHash) {
      const now = new Date().toISOString();
      sql.prepare(
        "INSERT OR IGNORE INTO buys(tweet_id,ca,amount_sui,tx_hash,created_at) VALUES(?,?,?,?,?)"
      ).run(tweetId, ca, amountSui, txHash, now);
      sql.prepare("INSERT OR REPLACE INTO seen_cas(ca,seen_at) VALUES(?,?)").run(ca, now);
    },
    getLastSeen(handle) {
      const r = sql.prepare("SELECT tweet_id FROM last_seen WHERE handle = ?").get(handle) as
        | { tweet_id: string }
        | undefined;
      return r ? r.tweet_id : null;
    },
    setLastSeen(handle, id) {
      sql.prepare("INSERT OR REPLACE INTO last_seen(handle,tweet_id) VALUES(?,?)").run(handle, id);
    },
    recordDetection(d) {
      sql.prepare(
        "INSERT OR IGNORE INTO detections(project,ca_key,ca_display,chain,source,detected_at) VALUES(?,?,?,?,?,?)"
      ).run(d.project, d.caKey, d.caDisplay, d.chain, d.source, d.detectedAt);
    },
    recentDetection(project, caKey, excludeSource, withinMs) {
      const cutoff = Date.now() - withinMs;
      const r = sql.prepare(
        "SELECT source, detected_at FROM detections WHERE project=? AND ca_key=? AND source!=? AND detected_at>? ORDER BY detected_at DESC LIMIT 1"
      ).get(project, caKey, excludeSource, cutoff) as
        | { source: string; detected_at: number }
        | undefined;
      return r ? { source: r.source, detectedAt: r.detected_at } : null;
    },
    close() {
      sql.close();
    },
  };
}
