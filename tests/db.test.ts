import { describe, expect, it } from "vitest";
import { initDb } from "../src/db.js";

describe("db dedup", () => {
  it("first sighting is not duplicate, second is", () => {
    const db = initDb(":memory:");
    expect(db.isDuplicate("t1", "0xabc")).toBe(false);
    db.recordBuy("t1", "0xabc", 1, "0xhash");
    expect(db.isDuplicate("t1", "0xabc")).toBe(true);
    db.close();
  });
  it("same CA from different tweet is duplicate (24h CA cache)", () => {
    const db = initDb(":memory:");
    db.recordBuy("t1", "0xabc", 1, "0xhash");
    expect(db.isDuplicate("t2", "0xabc")).toBe(true);
    db.close();
  });
  it("round-trips last_seen per account", () => {
    const db = initDb(":memory:");
    expect(db.getLastSeen("@foo")).toBeNull();
    db.setLastSeen("@foo", "123");
    expect(db.getLastSeen("@foo")).toBe("123");
    db.close();
  });
});
