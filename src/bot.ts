// src/bot.ts — project-grouped, alert-only commands (owner-only).
import { Bot } from "grammy";
import {
  addAccount, addProject, attachSource, detachSource, getIntervalSec,
  getSiteIntervalSec, isEnabled, listAccounts, listProjects, projectSources,
  removeAccount, removeProject, setEnabled, setIntervalSec, setSiteIntervalSec,
} from "./config.js";
import type { Db } from "./db.js";

export interface BotDeps {
  dbPath: string;
  db: Db;
  ownerId: number;
  getLastXCheck: () => number | null;
  getLastSiteCheck: () => number | null;
}

const clock = (t: number | null) =>
  t ? new Date(t).toLocaleTimeString("en-GB", { hour12: false }) : "-";

export function createBot(token: string, d: BotDeps): Bot {
  const bot = new Bot(token);
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== d.ownerId) return; // owner-only
    await next();
  });
  bot.command("addproject", async (ctx) => {
    const n = ctx.match.trim();
    if (!n) return ctx.reply("usage: /addproject <name>");
    try {
      addProject(d.dbPath, n);
      await ctx.reply(`project ${n.toLowerCase()} created`);
    } catch (e) { await ctx.reply(String(e)); }
  });
  bot.command("attach", async (ctx) => {
    const [name, src] = ctx.match.trim().split(/\s+/, 2);
    if (!name || !src) return ctx.reply("usage: /attach <project> <@x|https://url>");
    const kind = attachSource(d.dbPath, name, src);
    await ctx.reply(`attached ${kind} to ${name.toLowerCase()}`);
  });
  bot.command("detach", async (ctx) => {
    const [name, src] = ctx.match.trim().split(/\s+/, 2);
    if (!name || !src) return ctx.reply("usage: /detach <project> <@x|https://url>");
    detachSource(d.dbPath, name, src);
    await ctx.reply("detached");
  });
  bot.command("rmproject", async (ctx) => {
    const n = ctx.match.trim();
    if (!n) return ctx.reply("usage: /rmproject <name>");
    removeProject(d.dbPath, n);
    await ctx.reply("project removed");
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
  bot.command("addsite", async (ctx) => {
    await ctx.reply("deprecated — use /attach <project> <https://url>. " + (ctx.match.trim() ? "Nothing was added." : ""));
  });
  bot.command("list", async (ctx) => {
    const ps = listProjects(d.dbPath);
    if (!ps.length) return ctx.reply("(no projects — /addproject <name>)");
    const blocks = ps.map((p) => {
      const srcs = projectSources(d.dbPath, p)
        .map((s) => `  ${s.kind === "x" ? "𝕏" : "🌐"} ${s.value}`).join("\n");
      return `📦 ${p}\n${srcs}`;
    });
    await ctx.reply(blocks.join("\n\n"));
  });
  bot.command("set_interval", async (ctx) => {
    try {
      setIntervalSec(d.dbPath, Number(ctx.match.trim()));
      await ctx.reply(`x interval = ${getIntervalSec(d.dbPath)}s (restart bot to apply)`);
    } catch (e) { await ctx.reply(String(e)); }
  });
  bot.command("set_site_interval", async (ctx) => {
    try {
      setSiteIntervalSec(d.dbPath, Number(ctx.match.trim()));
      await ctx.reply(`site interval = ${getSiteIntervalSec(d.dbPath)}s (restart bot to apply)`);
    } catch (e) { await ctx.reply(String(e)); }
  });
  bot.command("stop", async (ctx) => {
    setEnabled(d.dbPath, false);
    await ctx.reply("monitoring OFF");
  });
  bot.command("start", async (ctx) => {
    setEnabled(d.dbPath, true);
    await ctx.reply("monitoring ON");
  });
  bot.command("status", async (ctx) => {
    const acc = listAccounts(d.dbPath);
    await ctx.reply(
      `enabled=${isEnabled(d.dbPath)} x=${getIntervalSec(d.dbPath)}s site=${getSiteIntervalSec(d.dbPath)}s\n` +
      `lastX=${clock(d.getLastXCheck())} lastSite=${clock(d.getLastSiteCheck())}\n` +
      `projects: ${listProjects(d.dbPath).join(", ") || "-"}\n` +
      `x accounts: ${acc.join(", ") || "-"}`,
    );
  });
  return bot;
}
