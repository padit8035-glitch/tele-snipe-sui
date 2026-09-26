import Sqlite from "better-sqlite3";

export interface DetectionInput {
  project: string; caKey: string; caDisplay: string;
  chain: string; source: string; detectedAt: number;
}
export interface RecentDetection { source: string; detectedAt: number }
export interface SourceState { lastHash: string | null; lastSeen: string | null; lastChangeAt: number | null }

export interface Db {
  isDuplicate(tweetId: string, ca: string): boolean;
  recordBuy(tweetId: string, ca: string, amountSui: number, txHash: string): void;
  getLastSeen(handle: string): string | null;
  setLastSeen(handle: string, id: string): void;
  recordDetection(d: DetectionInput): void;
  hasCa(project: string, caKey: string): boolean;
  recentDetection(project: string, caKey: string, excludeSource: string, withinMs: number): RecentDetection | null;
  getSourceState(project: string, kind: string, value: string): SourceState | null;
  setSourceState(project: string, kind: string, value: string, st: Partial<SourceState>): void;
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
    hasCa(project, caKey) {
      return !!sql.prepare(
        "SELECT 1 FROM detections WHERE project=? AND ca_key=? LIMIT 1"
      ).get(project, caKey);
    },
    getSourceState(project, kind, value) {
      const r = sql.prepare(
        "SELECT last_hash, last_seen, last_change_at FROM sources WHERE project=? AND kind=? AND value=?"
      ).get(project, kind, value) as
        | { last_hash: string | null; last_seen: string | null; last_change_at: number | null }
        | undefined;
      if (!r) return null;
      return { lastHash: r.last_hash, lastSeen: r.last_seen, lastChangeAt: r.last_change_at };
    },
    setSourceState(project, kind, value, st) {
      const cur = ((): SourceState => {
        const r = sql.prepare(
          "SELECT last_hash, last_seen, last_change_at FROM sources WHERE project=? AND kind=? AND value=?"
        ).get(project, kind, value) as
          | { last_hash: string | null; last_seen: string | null; last_change_at: number | null }
          | undefined;
        return {
          lastHash: r?.last_hash ?? null,
          lastSeen: r?.last_seen ?? null,
          lastChangeAt: r?.last_change_at ?? null,
        };
      })();
      const next = {
        lastHash: st.lastHash ?? cur.lastHash,
        lastSeen: st.lastSeen ?? cur.lastSeen,
        lastChangeAt: st.lastChangeAt ?? cur.lastChangeAt,
      };
      sql.prepare(
        "INSERT INTO sources(project,kind,value,last_seen,last_hash,last_change_at) VALUES(?,?,?,?,?,?) " +
        "ON CONFLICT(project,kind,value) DO UPDATE SET last_seen=excluded.last_seen, last_hash=excluded.last_hash, last_change_at=excluded.last_change_at"
      ).run(project, kind, value, next.lastSeen, next.lastHash, next.lastChangeAt);
    },
    close() {
      sql.close();
    },
  };
}
