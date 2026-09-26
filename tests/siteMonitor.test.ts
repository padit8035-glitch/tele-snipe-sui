// tests/siteMonitor.test.ts
import { describe, expect, it } from "vitest";
import { initDb } from "../src/db.js";
import { pollSites } from "../src/siteMonitor.js";

const EVM = "0x" + "3f".repeat(20);

function stub(pages: Record<string, string>, fail: string[] = []) {
  return async (url: string) => {
    if (fail.includes(url)) throw new Error("SITE_500");
    if (!(url in pages)) throw new Error("SITE_404");
    return pages[url];
  };
}

describe("pollSites", () => {
  it("baselines silently on first sight (existing CA recorded, no signal)", async () => {
    const db = initDb(":memory:");
    const pages = { "https://b.io": `<html>contract ${EVM}</html>` };
    const sigs = await pollSites(db, [{ project: "b", url: "https://b.io" }], stub(pages), 0);
    expect(sigs).toEqual([]);
    expect(db.hasCa("b", EVM.toLowerCase())).toBe(true);
    db.close();
  });
  it("emits only NEW CAs after page change", async () => {
    const db = initDb(":memory:");
    const pages = { "https://b.io": "<html>coming soon</html>" };
    const f = stub(pages);
    expect(await pollSites(db, [{ project: "b", url: "https://b.io" }], f, 0)).toEqual([]);
    pages["https://b.io"] = `<html>contract ${EVM}</html>`;
    const sigs = await pollSites(db, [{ project: "b", url: "https://b.io" }], f, 0);
    expect(sigs.length).toBe(1);
    expect(sigs[0]).toMatchObject({ project: "b", url: "https://b.io", ca: EVM, chain: "EVM" });
    // same content again → silent
    expect(await pollSites(db, [{ project: "b", url: "https://b.io" }], f, 0)).toEqual([]);
    db.close();
  });
  it("fetch errors are silent, hash kept", async () => {
    const db = initDb(":memory:");
    const pages = { "https://b.io": "<html>ok</html>" };
    await pollSites(db, [{ project: "b", url: "https://b.io" }], stub(pages), 0);
    await pollSites(db, [{ project: "b", url: "https://b.io" }], stub(pages, ["https://b.io"]), 0);
    pages["https://b.io"] = `<html>contract ${EVM}</html>`;
    const sigs = await pollSites(db, [{ project: "b", url: "https://b.io" }], stub(pages), 0);
    expect(sigs.length).toBe(1);
    db.close();
  });
});
