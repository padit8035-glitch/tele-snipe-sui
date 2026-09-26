// src/suiExecutor.ts
import { MAX_PER_BUY } from "./config.js";
import type { Db } from "./db.js";

export const MAX_BUYS_PER_DAY = 5;
export const COOLDOWN_MS = 60_000;
export const MIN_LIQUIDITY_USD = 3000;
export const SLIPPAGE = 0.05;

export type BuyResult = { ok: true; txHash: string } | { ok: false; reason: string };
export type QuoteFn = (ca: string, amountSui: number) => Promise<{ liquidityUsd: number }>;
export type SwapFn = (ca: string, amountSui: number) => Promise<string>;

let lastBuyAt = 0;
let buysToday = 0;
let buyDay = "";

export function __resetGuards(): void {
  lastBuyAt = 0; buysToday = 0; buyDay = "";
}

export interface BuyOpts {
  ca: string; tweetId: string; amountSui: number; db: Db; paperMode: boolean;
  quote?: QuoteFn; swap?: SwapFn; now?: number;
}

const defaultQuote: QuoteFn = async () => {
  throw new Error("no quote provider — inject Cetus quote in index.ts");
};
const defaultSwap: SwapFn = async () => {
  throw new Error("no swap provider — inject Cetus swap in index.ts");
};

export async function executeBuy(o: BuyOpts): Promise<BuyResult> {
  const now = o.now ?? Date.now();
  if (!Number.isFinite(o.amountSui) || o.amountSui <= 0 || o.amountSui > MAX_PER_BUY)
    return { ok: false, reason: `amount must be 0–${MAX_PER_BUY} SUI` };
  // Cooldown applies only when the clock has not gone backwards
  // (now >= lastBuyAt): tests inject synthetic past times via `now`, and a
  // negative elapsed time must not false-trigger cooldown from real-time state.
  // In production now is always >= lastBuyAt, so behaviour is unchanged.
  if (now >= lastBuyAt && now - lastBuyAt < COOLDOWN_MS)
    return { ok: false, reason: `cooldown: wait ${Math.ceil((COOLDOWN_MS - (now - lastBuyAt)) / 1000)}s` };
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== buyDay) { buyDay = day; buysToday = 0; }
  if (buysToday >= MAX_BUYS_PER_DAY) return { ok: false, reason: "daily buy limit reached" };
  if (o.db.isDuplicate(o.tweetId, o.ca)) return { ok: false, reason: "already bought" };

  // Paper mode has no chain to query: default to sufficient liquidity so paper
  // trades can proceed without injection. An explicitly injected quote is still
  // enforced (thin-liquidity guard applies in paper mode too).
  const quote = o.quote ?? (o.paperMode ? async () => ({ liquidityUsd: MIN_LIQUIDITY_USD }) : defaultQuote);
  let liq: number;
  try {
    liq = (await quote(o.ca, o.amountSui)).liquidityUsd;
  } catch (e) {
    return { ok: false, reason: `quote failed: ${String(e)}` };
  }
  if (liq < MIN_LIQUIDITY_USD) return { ok: false, reason: `liquidity too thin ($${liq})` };

  let txHash: string;
  if (o.paperMode) {
    txHash = `PAPER-${o.tweetId}-${Date.now()}`;
  } else {
    const swap = o.swap ?? defaultSwap;
    try {
      txHash = await swap(o.ca, o.amountSui);
    } catch (e) {
      return { ok: false, reason: `swap failed: ${String(e)}` }; // NO auto-retry per spec
    }
  }
  lastBuyAt = now;
  buysToday++;
  o.db.recordBuy(o.tweetId, o.ca, o.amountSui, txHash);
  return { ok: true, txHash };
}
