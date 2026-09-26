// src/bot.ts
import { Bot } from "grammy";
import {
  addAccount, getAmount, getIntervalSec, isEnabled,
  listAccounts, removeAccount, setAmount, setEnabled, setIntervalSec,
} from "./config.js";
import type { Db } from "./db.js";
import type { Signal } from "./xMonitor.js";
import type { BuyResult } from "./suiExecutor.js";

export interface BotDeps {
  dbPath: string;
  db: Db;
  ownerId: number;
  paperMode: boolean;
  getBalance: () => Promise<number>;
  executeBuySignal: (s: Signal) => Promise<BuyResult>;
}

export function createBot(token: string, d: BotDeps): Bot {
  const bot = new Bot(token);
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== d.ownerId) return; // owner-only
    await next();
  });
  bot.command("add", async (ctx) => {
    const h = ctx.match.trim();
    if (!h) return ctx.reply("usage: /add @handle");
    addAccount(d.dbPath, h);
    await ctx.reply(`tracking ${h}`);
  });
  bot.command("remove", async (ctx) => {
    removeAccount(d.dbPath, ctx.match.trim());
    await ctx.reply("removed");
  });
  bot.command("list", async (ctx) => {
    const acc = listAccounts(d.dbPath);
    await ctx.reply(acc.length ? acc.join("\n") : "(no accounts)");
  });
  bot.command("set_amount", async (ctx) => {
    try {
      setAmount(d.dbPath, Number(ctx.match.trim()));
      await ctx.reply(`amount = ${getAmount(d.dbPath)} SUI`);
    } catch (e) { await ctx.reply(String(e)); }
  });
  bot.command("set_interval", async (ctx) => {
    try {
      setIntervalSec(d.dbPath, Number(ctx.match.trim()));
      await ctx.reply(`interval = ${getIntervalSec(d.dbPath)}s`);
    } catch (e) { await ctx.reply(String(e)); }
  });
  bot.command("stop", async (ctx) => {
    setEnabled(d.dbPath, false);
    await ctx.reply("auto-buy OFF");
  });
  bot.command("start", async (ctx) => {
    setEnabled(d.dbPath, true);
    await ctx.reply("auto-buy ON");
  });
  bot.command("status", async (ctx) => {
    const bal = await d.getBalance().catch(() => NaN);
    await ctx.reply(
      `enabled=${isEnabled(d.dbPath)} amount=${getAmount(d.dbPath)} ` +
      `interval=${getIntervalSec(d.dbPath)}s paper=${d.paperMode} balance=${bal} SUI\n` +
      `accounts: ${listAccounts(d.dbPath).join(", ") || "-"}`,
    );
  });
  return bot;
}

export async function notifySignal(
  bot: Bot, ownerId: number, s: Signal, r: BuyResult, amount: number,
): Promise<void> {
  const head = r.ok ? `BUY ${amount} SUI` : `SKIP (${r.ok === false ? r.reason : ""})`;
  await bot.api.sendMessage(
    ownerId,
    `${head}\n${s.handle}: ${s.text.slice(0, 300)}\nCA: ${s.ca}\n${r.ok ? `tx: ${r.txHash}` : ""}`,
  );
}
