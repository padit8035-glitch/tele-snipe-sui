// src/caFilter.ts
const CA_RE = /0x[a-fA-F0-9]{64}(::\w+::\w+)?/g;

export function extractCoinTypes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CA_RE)) {
    if (!out.includes(m[0])) out.push(m[0]);
  }
  return out;
}
