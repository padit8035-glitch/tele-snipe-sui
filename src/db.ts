import Sqlite from "better-sqlite3";

export interface Db {
  isDuplicate(tweetId: string, ca: string): boolean;
  recordBuy(tweetId: string, ca: string, amountSui: number, txHash: string): void;
  getLastSeen(handle: string): string | null;
  setLastSeen(handle: string, id: string): void;
  close(): void;
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
    close() {
      sql.close();
    },
  };
}
