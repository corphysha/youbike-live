export type AvailabilityLevel = "good" | "low" | "none" | "full" | "offline";

export function availabilityLevel(
  available: number,
  empty: number,
  status: number,
): AvailabilityLevel {
  if (status !== 1) return "offline";
  if (available === 0 && empty === 0) return "none";
  if (available === 0) return "none";
  if (empty === 0) return "full";
  if (available <= 3) return "low";
  return "good";
}

export const LEVEL_LABEL: Record<AvailabilityLevel, string> = {
  good: "正常",
  low: "車輛偏少",
  none: "無車可借",
  full: "滿位",
  offline: "暫停營運",
};

export interface BikeCounts {
  /** YouBike 2.0 (plus any remaining 1.0) pedal bikes */
  regular: number;
  /** YouBike 2.0E electric-assist bikes */
  electric: number;
}

/**
 * Split the rentable total by bike type. Regular bikes are derived from the total so the two
 * always add up to the "可借" count, even when the feed omits or under-reports the detail.
 */
export function bikeCounts(station: { available: number; detail: { eyb: number } }): BikeCounts {
  const electric = Math.min(station.detail.eyb, station.available);
  return { regular: station.available - electric, electric };
}

/** "可借 5 輛（一般車 3、電輔車 2）" for titles and notifications */
export function bikeSummary(station: { available: number; detail: { eyb: number } }): string {
  const { regular, electric } = bikeCounts(station);
  return `可借 ${station.available} 輛（一般車 ${regular}、電輔車 ${electric}）`;
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "2026-10-02 08:30:40" → "08:30" (today) or "10/02 08:30" */
export function shortTime(raw: string, now = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return raw ? raw.slice(11, 16) || "—" : "—";
  const [, y, mo, d, h, mi] = m;
  const sameDay =
    Number(y) === now.getFullYear() &&
    Number(mo) === now.getMonth() + 1 &&
    Number(d) === now.getDate();
  return sameDay ? `${h}:${mi}` : `${mo}/${d} ${h}:${mi}`;
}

/** minutes since updated */
export function ageMinutes(raw: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  // feed times are Taiwan time (UTC+8)
  const diff = now.getTime() - (t + 8 * 3600 * 1000);
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff / 60000)) : null;
}

export function matchPinyinless(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase().trim());
}
