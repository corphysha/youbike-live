import type { ArrivalMessage } from "./arrival";
import type { StationView } from "./schema";
import { checkTripStation, findAlternatives } from "./trip";

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

function legSummary(
  station: StationView | undefined,
  leg: "start" | "end",
  stations: StationView[],
): string {
  const label = leg === "start" ? "起點" : "終點";
  const check = checkTripStation(station ?? null, leg);
  if (!station || check === "missing") return `${label}站點資料不存在`;
  if (check === "offline") return `${label}暫停營運`;

  const count =
    leg === "start" ? `${label}可借 ${station.available} 輛` : `${label}空位 ${station.empty} 格`;
  if (check !== "none") return count;

  const [nearest] = findAlternatives(stations, station, leg, { limit: 1 });
  if (!nearest) return `${count}（500 公尺內無替代站）`;
  const altCount =
    leg === "start" ? `可借 ${nearest.station.available} 輛` : `空位 ${nearest.station.empty} 格`;
  return `${count}，附近「${nearest.station.name}」${altCount}（約 ${Math.round(nearest.distance)} 公尺）`;
}

/** One notification covering both ends: bikes at the start, docks at the end. */
export function buildRouteMessage(route: SavedRoute, stations: StationView[]): ArrivalMessage {
  const byId = new Map(stations.map((station) => [station.id, station]));
  const start = byId.get(route.startId);
  const end = byId.get(route.endId);
  return {
    title: `路線：${start?.name ?? route.startId} → ${end?.name ?? route.endId}`,
    body: `${legSummary(start, "start", stations)}\n${legSummary(end, "end", stations)}`,
  };
}
