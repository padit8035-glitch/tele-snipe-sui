// src/xMonitor.ts
import { caKey, extractCAs, type Chain } from "./chainFilter.js";
import type { Db } from "./db.js";

export interface Tweet { id: string; text: string; createdAt?: number | null }
export interface Signal {
  handle: string; tweetId: string; text: string;
  ca: string; chain: Chain; createdAt: number | null;
}
export type Fetcher = (handle: string) => Promise<Tweet[]>;

// SWAP POINT: upgrade to paid X API by replacing ONLY this function.
// Must return newest-first or oldest-first — pollOnce sorts by id anyway.
export async function fetchLatestTweets(handle: string): Promise<Tweet[]> {
  const url = `https://cdn.syndication.twimg.com/timeline/profile/${encodeURIComponent(handle.replace(/^@/, ""))}`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (res.status === 429) throw new Error("X_RATE_LIMITED");
  if (!res.ok) throw new Error(`X_FETCH_${res.status}`);
  const body = (await res.json()) as { body?: string };
  void body;
  return []; // v1: parsing of syndication payload lands here; tests inject fetcher
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function pollOnce(
  db: Db,
  handles: string[],
  fetcher: Fetcher = fetchLatestTweets,
  gapMs = 4000,
): Promise<Signal[]> {
  const out: Signal[] = [];
  const seenThisPoll = new Set<string>(); // same CA twice in one batch → single signal
  for (const handle of handles) {
    let tweets: Tweet[];
    try {
      tweets = await fetcher(handle);
    } catch (e) {
      if (String(e).includes("X_RATE_LIMITED")) await sleep(60_000);
      continue;
    }
    const last = db.getLastSeen(handle);
    const fresh = tweets.filter((t) => !last || t.id > last).sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const t of fresh) {
      for (const d of extractCAs(t.text)) {
        if (seenThisPoll.has(caKey(d.ca))) continue;
        if (!db.isDuplicate(t.id, d.ca)) {
          out.push({
            handle, tweetId: t.id, text: t.text,
            ca: d.ca, chain: d.chain, createdAt: t.createdAt ?? null,
          });
          seenThisPoll.add(caKey(d.ca));
        }
      }
      db.setLastSeen(handle, t.id);
    }
    await sleep(gapMs);
  }
  return out;
}
