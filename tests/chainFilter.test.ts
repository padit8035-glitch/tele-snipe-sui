// tests/chainFilter.test.ts
import { describe, expect, it } from "vitest";
import { extractCAs } from "../src/chainFilter.js";

const SUI = "0x" + "ab".repeat(32) + "::meme::MEME";
const SUI_BARE = "0x" + "12".repeat(32);
const EVM = "0x" + "3f".repeat(20);
const SOL = "7xKp9zQw3mN4vB6cX8dF2gH5jK7mN9pQ3rS5tU";

describe("extractCAs", () => {
  it("extracts Sui coin-type", () => {
    expect(extractCAs(`live ${SUI}`)).toEqual([{ chain: "SUI", ca: SUI }]);
  });
  it("extracts bare Sui 64-hex", () => {
    expect(extractCAs(`ca ${SUI_BARE}`)).toEqual([{ chain: "SUI", ca: SUI_BARE }]);
  });
  it("extracts EVM 40-hex", () => {
    expect(extractCAs(`contract ${EVM} moon`)).toEqual([{ chain: "EVM", ca: EVM }]);
  });
  it("does NOT double-count Sui 64-hex as EVM", () => {
    expect(extractCAs(SUI_BARE)).toEqual([{ chain: "SUI", ca: SUI_BARE }]);
  });
  it("extracts SOL only with trigger word", () => {
    expect(extractCAs(`MINT ADDRESS: ${SOL}`)).toEqual([{ chain: "SOL", ca: SOL }]);
  });
  it("ignores SOL-like string without trigger", () => {
    expect(extractCAs(`hello ${SOL} world`)).toEqual([]);
  });
  it("rejects MD5-like hex even with trigger on page (blast.fun case)", () => {
    const md5 = "946a768adc4e47558c9d63d885d52d83";
    const far = "contract ".padEnd(400, "0") + md5;
    expect(extractCAs(far)).toEqual([]);
    expect(extractCAs(`MINT ADDRESS: ${md5}`)).toEqual([]);
  });
  it("does not emit SOL substrings of a Sui address even with trigger word", () => {
    expect(extractCAs(`CA drop ${SUI}`)).toEqual([{ chain: "SUI", ca: SUI }]);
  });
  it("returns [] for noise", () => {
    expect(extractCAs("just a vibe post")).toEqual([]);
  });
  it("dedups case-insensitively, keeps first display", () => {
    const lower = EVM.toLowerCase();
    expect(extractCAs(`${EVM} ${lower}`)).toEqual([{ chain: "EVM", ca: EVM }]);
  });
});
