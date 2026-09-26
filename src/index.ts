// src/index.ts
import "dotenv/config";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { createBot, notifySignal } from "./bot.js";
import { getAmount, isEnabled, listAccounts, getIntervalSec } from "./config.js";
import { initDb } from "./db.js";
import { executeBuy, SLIPPAGE } from "./suiExecutor.js";
import { pollOnce } from "./xMonitor.js";

const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
const ownerId = Number(process.env.OWNER_CHAT_ID ?? 0);
const paperMode = (process.env.PAPER_MODE ?? "true") !== "false";
const dbPath = process.env.DB_PATH ?? "./snipe.db";
if (!token || !ownerId) throw new Error("set TELEGRAM_BOT_TOKEN and OWNER_CHAT_ID");

const db = initDb(dbPath);
const sui = new SuiClient({ url: process.env.SUI_RPC_URL ?? getFullnodeUrl("mainnet") });

async function getBalance(): Promise<number> {
  const addr = Ed25519Keypair.fromSecretKey(
    Buffer.from(process.env.SUI_PRIVATE_KEY ?? "", "base64"),
  ).getPublicKey().toSuiAddress();
  const b = await sui.getBalance({ owner: addr });
  return Number(b.totalBalance) / 1e9;
}

async function cetusQuote(ca: string, amountSui: number): Promise<{ liquidityUsd: number }> {
  // Cetus aggregator quote: amount in MIST, slippage from spec
  const mist = Math.floor(amountSui * 1e9);
  const qs = new URLSearchParams({
    from: "0x2::sui::SUI", to: ca, amount: String(mist), slippage: String(SLIPPAGE),
  });
  const res = await fetch(`https://aggregator-api.cetus.zone/v1/quote?${qs}`);
  if (!res.ok) throw new Error(`cetus ${res.status}`);
  const j = (await res.json()) as { liquidityUsd?: number; routes?: unknown[] };
  if (!j.routes?.length) throw new Error("no route");
  return { liquidityUsd: Number(j.liquidityUsd ?? 0) };
}

async function cetusSwap(ca: string, amountSui: number): Promise<string> {
  void ca; void amountSui;
  // Filled after paper-mode validation week: build swap tx via Cetus router
  // + signAndExecuteTransaction with Ed25519Keypair.fromSecretKey(...).
  throw new Error("live swap not wired yet — validate in PAPER_MODE first");
}

const bot = createBot(token, {
  dbPath, db, ownerId, paperMode, getBalance,
  executeBuySignal: (s) =>
    executeBuy({ ca: s.ca, tweetId: s.tweetId, amountSui: getAmount(dbPath), db, paperMode, quote: cetusQuote, swap: cetusSwap }),
});

let running = false;
async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!isEnabled(dbPath)) return;
    const signals = await pollOnce(db, listAccounts(dbPath));
    for (const s of signals) {
      const r = await executeBuy({
        ca: s.ca, tweetId: s.tweetId, amountSui: getAmount(dbPath),
        db, paperMode, quote: cetusQuote, swap: cetusSwap,
      });
      await notifySignal(bot, ownerId, s, r, getAmount(dbPath));
    }
  } catch (e) {
    console.error("tick failed:", e);
  } finally {
    running = false;
  }
}

bot.start();
setInterval(tick, getIntervalSec(dbPath) * 1000);
void tick();
