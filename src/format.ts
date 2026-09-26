// src/format.ts — locked notification templates (tap-to-copy CA in code block).
import type { Chain } from "./chainFilter.js";

export interface DropSource { icon: "𝕏" | "🌐"; url: string }

export function ageLineForPost(nowMs: number, createdAtMs: number | null): string {
  if (createdAtMs === null) return "";
  const s = Math.max(0, Math.round((nowMs - createdAtMs) / 1000));
  return s < 90 ? `dipost ${s} detik lalu` : `dipost ${Math.round(s / 60)} menit lalu`;
}

export function ageLineForSite(siteIntervalSec: number): string {
  return `terdeteksi ≤${siteIntervalSec}s setelah halaman berubah`;
}

export function formatDrop(o: {
  chain: Chain; project: string; ca: string; ageLine: string;
  sources: DropSource[]; time: string;
}): string {
  const head = o.ageLine ? `📦 ${o.project} · ${o.ageLine}` : `📦 ${o.project}`;
  const lines = o.sources.map((s, i) =>
    `${i < o.sources.length - 1 ? "├" : "└"} ${s.icon} ${s.url}`).join("\n");
  // CAs (esp. Sui module/name parts) may contain _ * ` [ which break
  // Telegram Markdown parsing — escape them so sendMessage never 400s.
  const safeCa = o.ca.replace(/([_*`[])/g, "\\$1");
  return `🚨 CA DROP [${o.chain}]\n${head}\n\n\`${safeCa}\`\n\n📍 Terdeteksi di:\n${lines}\n\n⏱ ${o.time}`;
}

export function formatConfirm(o: { project: string; icon: "𝕏" | "🌐"; url: string }): string {
  return `✅ ${o.project} terkonfirmasi juga di ${o.icon} ${o.url}`;
}

export function clock(d = new Date()): string {
  return d.toLocaleTimeString("en-GB", { hour12: false });
}
