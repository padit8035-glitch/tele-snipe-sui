// src/chainFilter.ts — multi-chain CA extraction (alert-only; no trading).
export type Chain = "SUI" | "EVM" | "SOL";
export interface DetectedCa { chain: Chain; ca: string }

const SUI_RE = /0x[a-fA-F0-9]{64}(::\w+::\w+)?/g;
// 40-hex must NOT match the head of a 64-hex Sui address or a module path.
const EVM_RE = /0x[a-fA-F0-9]{40}(?![0-9a-fA-F:])/g;
const SOL_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const SOL_TRIGGERS = /\b(ca|contract|mint|mints|address|token address|pump|dex|jup|jupiter|raydium|moonshot)\b/i;

export function caKey(ca: string): string {
  return ca.toLowerCase();
}

export function extractCAs(text: string): DetectedCa[] {
  const out: DetectedCa[] = [];
  const seen = new Set<string>();
  const spans: [number, number][] = [];
  const push = (chain: Chain, ca: string, index: number) => {
    const k = caKey(ca);
    if (seen.has(k)) return;
    seen.add(k);
    spans.push([index, index + ca.length]);
    out.push({ chain, ca });
  };
  for (const m of text.matchAll(SUI_RE)) push("SUI", m[0], m.index ?? 0);
  for (const m of text.matchAll(EVM_RE)) push("EVM", m[0], m.index ?? 0);
  if (SOL_TRIGGERS.test(text)) {
    for (const m of text.matchAll(SOL_RE)) {
      const s = m.index ?? 0;
      const e = s + m[0].length;
      // Skip SOL candidates overlapping an exact SUI/EVM match (hex runs
      // contain long base58-valid spans that are not Solana addresses).
      if (spans.some(([a, b]) => s < b && e > a)) continue;
      push("SOL", m[0], s);
    }
  }
  return out;
}
