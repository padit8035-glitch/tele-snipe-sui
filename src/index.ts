// src/index.ts — alert-only CA sniper: X + websites, grouped by project.
import "dotenv/config";
import { createBot } from "./bot.js";
import {
  getIntervalSec, getSiteIntervalSec, isEnabled, listProjects,
  projectOfSource, projectSources,
} from "./config.js";
import { caKey, type Chain } from "./chainFilter.js";
import { initDb, migrateDb, type Db } from "./db.js";
import { ageLineForPost, ageLineForSite, clock, formatConfirm, formatDrop } from "./format.js";
import { pollOnce } from "./xMonitor.js";
import { pollSites } from "./siteMonitor.js";

const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
const ownerId = Number(process.env.OWNER_CHAT_ID ?? 0);
const dbPath = process.env.DB_PATH ?? "./snipe.db";
if (!token || !ownerId) throw new Error("set TELEGRAM_BOT_TOKEN and OWNER_CHAT_ID");

const CONFIRM_WINDOW_MS = 10 * 60 * 1000;

const db: Db = initDb(dbPath);
migrateDb(dbPath); // legacy accounts+last_seen → projects (idempotent)

let lastXCheck: number | null = null;
let lastSiteCheck: number | null = null;

const bot = createBot(token, {
  dbPath, db, ownerId,
  getLastXCheck: () => lastXCheck,
  getLastSiteCheck: () => lastSiteCheck,
});

async function send(text: string): Promise<void> {
  await bot.api.sendMessage(ownerId, text, { parse_mode: "Markdown" });
}

interface Drop {
  project: string; chain: Chain; ca: string;
  ageLine: string; icon: "𝕏" | "🌐"; url: string;
  sourceId: string; refId: string;
}

async function handleDrop(d: Drop): Promise<void> {
  const key = caKey(d.ca);
  const now = Date.now();
  const recent = db.recentDetection(d.project, key, d.sourceId, CONFIRM_WINDOW_MS);
  db.recordDetection({
    project: d.project, caKey: key, caDisplay: d.ca,
    chain: d.chain, source: d.sourceId, detectedAt: now,
  });
  db.recordBuy(`alert:${d.project}:${d.sourceId}:${d.refId}`, d.ca, 0, "ALERT");
  if (recent) {
    await send(formatConfirm({ project: d.project, icon: d.icon, url: d.url }));
  } else {
    await send(formatDrop({
      chain: d.chain, project: d.project, ca: d.ca, ageLine: d.ageLine,
      sources: [{ icon: d.icon, url: d.url }], time: clock(),
    }));
  }
}

let runningX = false;
async function tickX(): Promise<void> {
  if (runningX) return;
  runningX = true;
  try {
    if (!isEnabled(dbPath)) return;
    for (const project of listProjects(dbPath)) {
      const handles = projectSources(dbPath, project)
        .filter((s) => s.kind === "x").map((s) => s.value);
      if (!handles.length) continue;
      const signals = await pollOnce(db, handles);
      const now = Date.now();
      for (const s of signals) {
        const owner = projectOfSource(dbPath, "x", s.handle) ?? project;
        await handleDrop({
          project: owner, chain: s.chain, ca: s.ca,
          ageLine: ageLineForPost(now, s.createdAt),
          icon: "𝕏",
          url: `https://x.com/${s.handle.replace(/^@/, "")}/status/${s.tweetId}`,
          sourceId: `x:${s.handle}`, refId: s.tweetId,
        });
      }
    }
  } catch (e) {
    console.error("tickX failed:", e);
  } finally {
    lastXCheck = Date.now();
    runningX = false;
  }
}

let runningSite = false;
async function tickSite(): Promise<void> {
  if (runningSite) return;
  runningSite = true;
  try {
    if (!isEnabled(dbPath)) return;
    const targets = listProjects(dbPath).flatMap((project) =>
      projectSources(dbPath, project)
        .filter((s) => s.kind === "site")
        .map((s) => ({ project, url: s.value })));
    if (!targets.length) return;
    const signals = await pollSites(db, targets);
    const siteInterval = getSiteIntervalSec(dbPath);
    for (const s of signals) {
      await handleDrop({
        project: s.project, chain: s.chain, ca: s.ca,
        ageLine: ageLineForSite(siteInterval),
        icon: "🌐", url: s.url,
        sourceId: `site:${s.url}`, refId: `${s.detectedAt}`,
      });
    }
  } catch (e) {
    console.error("tickSite failed:", e);
  } finally {
    lastSiteCheck = Date.now();
    runningSite = false;
  }
}

bot.start();
setInterval(tickX, getIntervalSec(dbPath) * 1000);
setInterval(tickSite, getSiteIntervalSec(dbPath) * 1000);
void tickX();
void tickSite();
