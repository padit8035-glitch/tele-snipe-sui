// tests/config.test.ts (corrected — use one temp file per test)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addAccount, getAmount, getIntervalSec, isEnabled,
  listAccounts, removeAccount, setAmount, setEnabled, setIntervalSec,
} from "../src/config.js";

const fresh = () => join(mkdtempSync(join(tmpdir(), "snipe-")), "s.db");

describe("config", () => {
  it("defaults: amount 1, interval 12, enabled true", () => {
    const p = fresh();
    expect(getAmount(p)).toBe(1);
    expect(getIntervalSec(p)).toBe(12);
    expect(isEnabled(p)).toBe(true);
  });
  it("rejects amount > 5 and interval < 8", () => {
    const p = fresh();
    expect(() => setAmount(p, 6)).toThrow();
    expect(() => setIntervalSec(p, 5)).toThrow();
  });
  it("adds/lists/removes accounts", () => {
    const p = fresh();
    addAccount(p, "@foo");
    addAccount(p, "bar");
    expect(listAccounts(p)).toEqual(["@bar", "@foo"]);
    removeAccount(p, "@foo");
    expect(listAccounts(p)).toEqual(["@bar"]);
  });
  it("stop/start flips enabled", () => {
    const p = fresh();
    setEnabled(p, false);
    expect(isEnabled(p)).toBe(false);
  });
});
