// tests/e2e.test.ts
import { describe, expect, it } from "vitest";
import { initDb } from "../src/db.js";
import { executeBuy } from "../src/suiExecutor.js";
import { pollOnce } from "../src/xMonitor.js";

const CA = "0x" + "ff".repeat(32) + "::meme::MEME";

describe("e2e simulation", () => {
  it("noise ignored, CA bought exactly once", async () => {
    const db = initDb(":memory:");
    const fetcher = async () => [
      { id: "1", text: "gm everyone" },
      { id: "2", text: `stealth launch ${CA}` },
      { id: "3", text: `reminder ${CA}` }, // same CA retweet → dedup, no signal
    ];
    const sigs = await pollOnce(db, ["@caller"], fetcher, 0);
    expect(sigs.map((s) => s.tweetId)).toEqual(["2"]);
    const r = await executeBuy({
      ca: sigs[0].ca, tweetId: sigs[0].tweetId, amountSui: 1, db,
      paperMode: true, quote: async () => ({ liquidityUsd: 10_000 }),
    });
    expect(r.ok).toBe(true);
    const r2 = await executeBuy({
      ca: sigs[0].ca, tweetId: sigs[0].tweetId, amountSui: 1, db,
      paperMode: true, quote: async () => ({ liquidityUsd: 10_000 }),
    });
    expect(r2.ok).toBe(false); // duplicate guarded
    db.close();
  });
});
