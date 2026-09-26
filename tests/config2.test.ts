// tests/config2.test.ts — projects, sources, site interval
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addProject, attachSource, detachSource, getSiteIntervalSec, listProjects,
  projectSources, removeProject, setSiteIntervalSec,
} from "../src/config.js";

const fresh = () => join(mkdtempSync(join(tmpdir(), "snipe-")), "s.db");

describe("config v2", () => {
  it("site interval defaults 30, min 15", () => {
    const p = fresh();
    expect(getSiteIntervalSec(p)).toBe(30);
    expect(() => setSiteIntervalSec(p, 10)).toThrow();
    setSiteIntervalSec(p, 45);
    expect(getSiteIntervalSec(p)).toBe(45);
  });
  it("project + attach x and site", () => {
    const p = fresh();
    addProject(p, "Blast");
    expect(attachSource(p, "blast", "@blastdotfun")).toBe("x");
    expect(attachSource(p, "blast", "https://blastdotfun.io/token")).toBe("site");
    expect(listProjects(p)).toEqual(["blast"]);
    expect(projectSources(p, "blast")).toEqual([
      { kind: "site", value: "https://blastdotfun.io/token", lastSeen: null },
      { kind: "x", value: "@blastdotfun", lastSeen: null },
    ]);
  });
  it("detach drops empty project", () => {
    const p = fresh();
    attachSource(p, "solo", "@solo");
    detachSource(p, "solo", "@solo");
    expect(listProjects(p)).toEqual([]);
  });
  it("removeProject clears sources", () => {
    const p = fresh();
    attachSource(p, "gone", "https://g.io");
    removeProject(p, "gone");
    expect(listProjects(p)).toEqual([]);
    expect(projectSources(p, "gone")).toEqual([]);
  });
});
