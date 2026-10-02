const KEY = "youbike-live:favorites";

export function loadFavorites(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function save(ids: string[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // storage full or blocked — favorites become session-only
  }
}

export function toggleFavorite(ids: string[], id: string): string[] {
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  save(next);
  return next;
}

export function clearFavorites(): string[] {
  save([]);
  return [];
}
