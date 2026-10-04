import { type GeoPoint, getDistanceMeters } from "./distance";
import type { StationView } from "./schema";

export type { ArrivalMessage } from "./notification-messages";

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

export interface ArrivalMonitor {
  /** Record a new position fix and check it against the current targets. */
  update: (location: GeoPoint) => void;
  /** Re-check the last fix, e.g. after the feed loads or a target is added. */
  recheck: () => void;
  /** Stop checking; pending deliveries see `isActive() === false` and should drop out. */
  stop: () => void;
}

/**
 * Keeps the latest fix and the enter/cooldown state across target changes. `watchPosition` only
 * reports when the position changes, so a stationary user must be re-checked when targets change.
 */
export function createArrivalMonitor(
  getTargets: () => ArrivalTarget[],
  onArrivals: (arrivals: ArrivalTarget[], isActive: () => boolean) => void,
  now: () => number = Date.now,
): ArrivalMonitor {
  let state = INITIAL_ARRIVAL_STATE;
  let lastLocation: GeoPoint | null = null;
  let active = true;
  const isActive = () => active;

  const check = () => {
    if (!active || !lastLocation) return;
    const result = detectArrivals(lastLocation, getTargets(), state, now());
    state = result.state;
    if (result.arrivals.length > 0) onArrivals(result.arrivals, isActive);
  };

  return {
    update(location) {
      lastLocation = location;
      check();
    },
    recheck: check,
    stop() {
      active = false;
      lastLocation = null;
    },
  };
}
