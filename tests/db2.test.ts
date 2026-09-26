// tests/db2.test.ts — detections + migration (projects verified via config fns)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Sqlite from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { listProjects, projectSources } from "../src/config.js";
import { initDb, migrateDb } from "../src/db.js";

const fresh = () => join(mkdtempSync(join(tmpdir(), "snipe-")), "s.db");

describe("db v2", () => {
  it("migrates accounts+last_seen into projects, preserving cursors", () => {
    const p = fresh();
    const raw = new Sqlite(p);
    raw.exec(`CREATE TABLE accounts(handle TEXT PRIMARY KEY);
      CREATE TABLE last_seen(handle TEXT PRIMARY KEY, tweet_id TEXT NOT NULL);`);
    raw.prepare("INSERT INTO accounts(handle) VALUES('@Foo')").run();
    raw.prepare("INSERT INTO last_seen(handle,tweet_id) VALUES('@Foo','999')").run();
    raw.close();
    const db = initDb(p);
    const n = migrateDb(p);
    expect(n).toBe(1);
    expect(listProjects(p)).toEqual(["foo"]);
    expect(projectSources(p, "foo")).toEqual([{ kind: "x", value: "@foo", lastSeen: "999" }]);
    expect(migrateDb(p)).toBe(0); // idempotent
    db.close();
  });
  it("records detections and finds recent ones from other sources", () => {
    const db = initDb(":memory:");
    expect(db.recentDetection("blast", "0xabc", "x:@a", 10 * 60 * 1000)).toBeNull();
    db.recordDetection({
      project: "blast", caKey: "0xabc", caDisplay: "0xABC",
      chain: "EVM", source: "site:https://b.io", detectedAt: Date.now(),
    });
    expect(db.recentDetection("blast", "0xabc", "x:@a", 10 * 60 * 1000)?.source)
      .toBe("site:https://b.io");
    expect(db.recentDetection("blast", "0xabc", "site:https://b.io", 10 * 60 * 1000)).toBeNull();
    db.close();
  });
  it("window expiry: old detections do not confirm", () => {
    const db = initDb(":memory:");
    db.recordDetection({
      project: "blast", caKey: "0xabc", caDisplay: "0xABC",
      chain: "EVM", source: "site:https://b.io", detectedAt: Date.now() - 20 * 60 * 1000,
    });
    expect(db.recentDetection("blast", "0xabc", "x:@a", 10 * 60 * 1000)).toBeNull();
    db.close();
  });
});
