// src/siteMonitor.ts — poll project websites for newly dropped CAs.
import { createHash } from "node:crypto";
import { caKey, extractCAs, type Chain } from "./chainFilter.js";
import type { Db } from "./db.js";

export interface SiteTarget { project: string; url: string }
export interface SiteSignal {
  project: string; url: string; ca: string; chain: Chain; detectedAt: number;
}
export type PageFetcher = (url: string) => Promise<string>;

export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; CASnipe/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`SITE_${res.status}`);
  return res.text();
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function pollSites(
  db: Db,
  targets: SiteTarget[],
  fetcher: PageFetcher = fetchPage,
  gapMs = 2000,
): Promise<SiteSignal[]> {
  const out: SiteSignal[] = [];
  for (const t of targets) {
    let page: string;
    try {
      page = await fetcher(t.url);
    } catch {
      continue; // keep old hash; retry next round
    }
    const h = hash(page);
    const st = db.getSourceState(t.project, "site", t.url);
    const now = Date.now();
    if (!st || st.lastHash === null) {
      // First sight: baseline silently — record existing CAs, emit nothing.
      db.setSourceState(t.project, "site", t.url, { lastHash: h });
      for (const d of extractCAs(page)) {
        db.recordDetection({
          project: t.project, caKey: caKey(d.ca), caDisplay: d.ca,
          chain: d.chain, source: `site:${t.url}`, detectedAt: now,
        });
      }
    } else if (st.lastHash !== h) {
      db.setSourceState(t.project, "site", t.url, { lastHash: h, lastChangeAt: now });
      for (const d of extractCAs(page)) {
        const k = caKey(d.ca);
        if (!db.hasCa(t.project, k)) {
          db.recordDetection({
            project: t.project, caKey: k, caDisplay: d.ca,
            chain: d.chain, source: `site:${t.url}`, detectedAt: now,
          });
          out.push({ project: t.project, url: t.url, ca: d.ca, chain: d.chain, detectedAt: now });
        }
      }
    }
    await sleep(gapMs);
  }
  return out;
}
