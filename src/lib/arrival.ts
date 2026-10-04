import { type GeoPoint, getDistanceMeters } from "./distance";
import type { StationView } from "./schema";
import { findAlternatives } from "./trip";

/** Entering this radius counts as arriving at a station. */
export const ARRIVAL_RADIUS_METERS = 150;
/** Leaving needs a wider radius so GPS jitter at the boundary does not re-trigger alerts. */
export const DEPARTURE_RADIUS_METERS = 250;
/** Even after leaving and re-entering, the same station alerts at most once per cooldown. */
export const ALERT_COOLDOWN_MS = 20 * 60_000;

export type ArrivalRole = "favorite" | "start" | "end";

export interface ArrivalTarget {
  station: StationView;
  role: ArrivalRole;
}

export interface ArrivalState {
  /** Station ids the user is currently within range of. */
  inside: string[];
  /** Station id → epoch ms of the last notification. */
  lastAlertAt: Record<string, number>;
}

export const INITIAL_ARRIVAL_STATE: ArrivalState = { inside: [], lastAlertAt: {} };

/** Trip roles win over favorites so the alert reports bikes for the start and docks for the end. */
export function collectArrivalTargets(
  stations: StationView[],
  favorites: string[],
  trip: { startId: string | null; endId: string | null },
): ArrivalTarget[] {
  const byId = new Map(stations.map((station) => [station.id, station]));
  const targets = new Map<string, ArrivalTarget>();
  for (const id of favorites) {
    const station = byId.get(id);
    if (station) targets.set(id, { station, role: "favorite" });
  }
  const start = trip.startId ? byId.get(trip.startId) : undefined;
  if (start) targets.set(start.id, { station: start, role: "start" });
  const end = trip.endId ? byId.get(trip.endId) : undefined;
  if (end) targets.set(end.id, { station: end, role: "end" });
  return [...targets.values()];
}

export function detectArrivals(
  location: GeoPoint,
  targets: ArrivalTarget[],
  state: ArrivalState,
  nowMs: number,
): { arrivals: ArrivalTarget[]; state: ArrivalState } {
  const wasInside = new Set(state.inside);
  const inside: string[] = [];
  const lastAlertAt = { ...state.lastAlertAt };
  const arrivals: ArrivalTarget[] = [];

  for (const target of targets) {
    const id = target.station.id;
    const distance = getDistanceMeters(location, target.station);
    if (wasInside.has(id)) {
      if (distance <= DEPARTURE_RADIUS_METERS) inside.push(id);
      continue;
    }
    if (distance > ARRIVAL_RADIUS_METERS) continue;

    inside.push(id);
    const last = lastAlertAt[id];
    if (last !== undefined && nowMs - last < ALERT_COOLDOWN_MS) continue;
    lastAlertAt[id] = nowMs;
    arrivals.push(target);
  }

  return { arrivals, state: { inside, lastAlertAt } };
}

const ROLE_LABEL: Record<ArrivalRole, string> = {
  favorite: "已到達最愛站點",
  start: "已到達起點",
  end: "已到達終點",
};

export interface ArrivalMessage {
  title: string;
  body: string;
}

export function buildArrivalMessage(
  { station, role }: ArrivalTarget,
  stations: StationView[] = [],
): ArrivalMessage {
  const title = `${ROLE_LABEL[role]}：${station.name}`;
  if (station.status !== 1) return { title, body: "此站暫停營運，請改用附近站點。" };

  const bikes = `可借 ${station.available} 輛`;
  const docks = `空位 ${station.empty} 格`;
  const counts = role === "end" ? `${docks} · ${bikes}` : `${bikes} · ${docks}`;
  const lacking = role === "end" ? station.empty === 0 : station.available === 0;
  if (role === "favorite" || !lacking) return { title, body: counts };

  const [nearest] = findAlternatives(stations, station, role, { limit: 1 });
  const hint = nearest
    ? `附近「${nearest.station.name}」${
        role === "end" ? `空位 ${nearest.station.empty} 格` : `可借 ${nearest.station.available} 輛`
      }（約 ${Math.round(nearest.distance)} 公尺）`
    : "500 公尺內沒有其他可用站點";
  return { title, body: `${counts}。${hint}` };
}
