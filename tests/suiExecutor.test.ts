// tests/suiExecutor.test.ts
import { describe, expect, it } from "vitest";
import { executeBuy } from "../src/suiExecutor.js";
import { initDb } from "../src/db.js";

const base = { ca: "0x" + "ee".repeat(32) + "::m::M", amountSui: 1, paperMode: true };

describe("executeBuy guards", () => {
  it("paper mode records buy with paper hash, no swap call", async () => {
    const db = initDb(":memory:");
    let swapped = 0;
    const r = await executeBuy({ ...base, tweetId: "t1", db, swap: async () => { swapped++; return "0xreal"; } });
    expect(r).toEqual({ ok: true, txHash: expect.stringMatching(/^PAPER-/) });
    expect(swapped).toBe(0);
    db.close();
  });
  it("rejects amount over max", async () => {
    const db = initDb(":memory:");
    const r = await executeBuy({ ...base, tweetId: "t2", db, amountSui: 99 });
    expect(r.ok).toBe(false);
    db.close();
  });
  it("enforces 60s cooldown between buys", async () => {
    const db = initDb(":memory:");
    await executeBuy({ ...base, tweetId: "t3", db, now: 1_000 });
    const r = await executeBuy({ ...base, tweetId: "t4", db, now: 30_000 });
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/cooldown/i) });
    db.close();
  });
  it("skips thin liquidity", async () => {
    const db = initDb(":memory:");
    const r = await executeBuy({ ...base, tweetId: "t5", db, quote: async () => ({ liquidityUsd: 100 }) });
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/liquidity/i) });
    db.close();
  });
});
