import type { Brand } from "./types";

// How a client is recognised at a glance: a stable colour and initials, a
// readable slug for the address bar, and the recently used list.

/** A stable, distinct hue per client (from its id), as CSS colours. */
export function clientColor(b: Pick<Brand, "id">): { bg: string; fg: string } {
  let h = 0;
  for (const ch of b.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return { bg: `hsl(${hue} 62% 42%)`, fg: "#fff" };
}

export function clientInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function clientSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** The client a ?client= value names: by slug, else by id. */
export function findClient(brands: Brand[], value: string | null): Brand | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  return brands.find((b) => clientSlug(b.name) === v) || brands.find((b) => b.id === value);
}

const RECENT_KEY = "geo:recentClients";

/** Most recently used client ids, newest first (per browser). */
export function recentClients(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function rememberClient(id: string): void {
  try {
    const next = [id, ...recentClients().filter((x) => x !== id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked (private window): the address bar still carries the client.
  }
}
