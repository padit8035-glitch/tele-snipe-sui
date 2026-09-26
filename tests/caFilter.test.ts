// tests/caFilter.test.ts
import { describe, expect, it } from "vitest";
import { extractCoinTypes } from "../src/caFilter.js";

const CA = "0x" + "ab".repeat(32) + "::meme::MEME";

describe("extractCoinTypes", () => {
  it("extracts full coin-type from post", () => {
    expect(extractCoinTypes(`gem baru ${CA} gas`)).toEqual([CA]);
  });
  it("extracts bare 64-hex object id", () => {
    const bare = "0x" + "12".repeat(32);
    expect(extractCoinTypes(`ca ${bare}`)).toEqual([bare]);
  });
  it("returns [] when no CA present", () => {
    expect(extractCoinTypes("just a vibe post, no contract")).toEqual([]);
  });
  it("dedups repeated CA in one post", () => {
    expect(extractCoinTypes(`${CA} ${CA}`)).toEqual([CA]);
  });
});
