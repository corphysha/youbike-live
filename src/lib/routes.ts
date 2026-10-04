const KEY = "youbike-live:routes";
const MAX_ROUTES = 20;

/** A saved start → end pair; counts are always read live from the feed. */
export interface SavedRoute {
  id: string;
  startId: string;
  endId: string;
}

export function routeId(startId: string, endId: string): string {
  return `${startId}>${endId}`;
}

export function loadRoutes(): SavedRoute[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") return [];
      const { startId, endId } = entry as Record<string, unknown>;
      if (typeof startId !== "string" || typeof endId !== "string") return [];
      return [{ id: routeId(startId, endId), startId, endId }];
    });
  } catch {
    return [];
  }
}

function save(routes: SavedRoute[]): SavedRoute[] {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(routes));
  } catch {
    // storage full or blocked — routes become session-only
  }
  return routes;
}

/** Saving an existing pair removes it, so the same button both saves and unsaves. */
export function toggleRoute(routes: SavedRoute[], startId: string, endId: string): SavedRoute[] {
  const id = routeId(startId, endId);
  if (routes.some((route) => route.id === id)) {
    return save(routes.filter((route) => route.id !== id));
  }
  return save([...routes, { id, startId, endId }].slice(-MAX_ROUTES));
}

export function removeRoute(routes: SavedRoute[], id: string): SavedRoute[] {
  return save(routes.filter((route) => route.id !== id));
}
