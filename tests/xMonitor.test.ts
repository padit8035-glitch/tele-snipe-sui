// tests/xMonitor.test.ts
import { describe, expect, it, vi } from "vitest";
import { initDb } from "../src/db.js";
import { pollOnce, type Tweet } from "../src/xMonitor.js";

const CA = "0x" + "cd".repeat(32) + "::meme::MEME";

describe("pollOnce", () => {
  it("emits signal only for new tweets containing CA", async () => {
    const db = initDb(":memory:");
    const feed: Record<string, Tweet[]> = {
      "@foo": [
        { id: "1", text: "hello world" },
        { id: "2", text: `launch ${CA}` },
      ],
    };
    const fetcher = vi.fn(async (h: string) => feed[h] ?? []);
    const sigs = await pollOnce(db, ["@foo"], fetcher, 0);
    expect(sigs).toEqual([{ handle: "@foo", tweetId: "2", text: `launch ${CA}`, ca: CA }]);
    // second poll: no new tweets → no signals, cursor advanced
    const sigs2 = await pollOnce(db, ["@foo"], fetcher, 0);
    expect(sigs2).toEqual([]);
    expect(db.getLastSeen("@foo")).toBe("2");
    db.close();
  });
  it("skips already-bought CA from another tweet", async () => {
    const db = initDb(":memory:");
    db.recordBuy("old", CA, 1, "0xh");
    const fetcher = async () => [{ id: "9", text: `again ${CA}` }];
    expect(await pollOnce(db, ["@foo"], fetcher, 0)).toEqual([]);
    db.close();
  });
});
