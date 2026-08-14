// Small pure helpers ported from the prototype. React handles HTML escaping,
// so `esc` is intentionally omitted here.

export const avg = (a: number[]): number =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

export const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

export const r1 = (n: number): number => Math.round(n * 10) / 10;

export function host(u?: string | null): string {
  try {
    return new URL(u || "").hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return (u || "")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

export function stars(n?: number | null): string {
  const v = Math.max(1, Math.min(5, n || 3));
  return "★★★★★".slice(0, v) + "☆☆☆☆☆".slice(0, 5 - v);
}

export function newsDate(s?: string | null): string {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s || "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthLabel(): string {
  return new Date().toISOString().slice(0, 7);
}
