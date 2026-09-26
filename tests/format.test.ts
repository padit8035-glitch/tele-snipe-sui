// tests/format.test.ts — locked notification templates
import { describe, expect, it } from "vitest";
import { ageLineForPost, ageLineForSite, formatConfirm, formatDrop } from "../src/format.js";

describe("format", () => {
  it("drop with post age", () => {
    const msg = formatDrop({
      chain: "SUI", project: "blast", ca: "0xABC",
      ageLine: "dipost 14 detik lalu",
      sources: [{ icon: "𝕏", url: "https://x.com/a/status/1" }],
      time: "21:40:12",
    });
    expect(msg).toBe(
      "🚨 CA DROP [SUI]\n📦 blast · dipost 14 detik lalu\n\n`0xABC`\n\n📍 Terdeteksi di:\n└ 𝕏 https://x.com/a/status/1\n\n⏱ 21:40:12",
    );
  });
  it("drop with two sources uses ├/└", () => {
    const msg = formatDrop({
      chain: "EVM", project: "blast", ca: "0xC",
      ageLine: "terdeteksi ≤30s setelah halaman berubah",
      sources: [
        { icon: "𝕏", url: "https://x.com/a/status/1" },
        { icon: "🌐", url: "https://b.io" },
      ],
      time: "21:40:12",
    });
    expect(msg).toContain("├ 𝕏 https://x.com/a/status/1\n└ 🌐 https://b.io");
  });
  it("escapes markdown in CA (underscore module)", () => {
    const msg = formatDrop({
      chain: "SUI", project: "p", ca: "0xAA::my_token::X",
      ageLine: "", sources: [{ icon: "🌐", url: "https://b.io" }], time: "00:00:00",
    });
    expect(msg).toContain("`0xAA::my\\_token::X`");
  });
  it("confirm message", () => {
    expect(formatConfirm({ project: "blast", icon: "🌐", url: "https://b.io" }))
      .toBe("✅ blast terkonfirmasi juga di 🌐 https://b.io");
  });
  it("age lines", () => {
    expect(ageLineForPost(100_000, 86_000)).toBe("dipost 14 detik lalu");
    expect(ageLineForPost(200_000, 80_000)).toBe("dipost 2 menit lalu");
    expect(ageLineForPost(100_000, null)).toBe("");
    expect(ageLineForSite(30)).toBe("terdeteksi ≤30s setelah halaman berubah");
  });
});
