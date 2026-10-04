import { type GeoPoint, getDistanceMeters } from "./distance";
import type { StationView } from "./schema";

const KEY = "youbike-live:trip";

export interface Trip {
  startId: string | null;
  endId: string | null;
}

export const EMPTY_TRIP: Trip = { startId: null, endId: null };

export function loadTrip(): Trip {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return EMPTY_TRIP;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_TRIP;
    const { startId, endId } = parsed as Record<string, unknown>;
    return {
      startId: typeof startId === "string" ? startId : null,
      endId: typeof endId === "string" ? endId : null,
    };
  } catch {
    return EMPTY_TRIP;
  }
}

export function saveTrip(trip: Trip): Trip {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(trip));
  } catch {
    // storage full or blocked — trip becomes session-only
  }
  return trip;
}

export function getTripRole(trip: Trip, id: string): "start" | "end" | null {
  if (trip.startId === id) return "start";
  if (trip.endId === id) return "end";
  return null;
}

/** Setting a station as one end clears it from the other, so start and end never coincide. */
export function setTripStation(trip: Trip, role: "start" | "end", id: string | null): Trip {
  if (role === "start") {
    return { startId: id, endId: trip.endId === id ? null : trip.endId };
  }
  return { startId: trip.startId === id ? null : trip.startId, endId: id };
}

export type TripCheck = "ok" | "low" | "none" | "offline" | "missing";

const LOW_THRESHOLD = 3;

/** Start needs bikes to borrow; end needs empty docks to return. */
export function checkTripStation(station: StationView | null, role: "start" | "end"): TripCheck {
  if (!station) return "missing";
  if (station.status !== 1) return "offline";
  const count = role === "start" ? station.available : station.empty;
  if (count === 0) return "none";
  if (count <= LOW_THRESHOLD) return "low";
  return "ok";
}

export const TRIP_CHECK_LABEL: Record<"start" | "end", Record<TripCheck, string>> = {
  start: {
    ok: "車輛充足",
    low: "車輛偏少",
    none: "無車可借",
    offline: "暫停營運",
    missing: "站點資料不存在",
  },
  end: {
    ok: "空位充足",
    low: "空位偏少",
    none: "滿位無法還車",
    offline: "暫停營運",
    missing: "站點資料不存在",
  },
};

export interface NearbyStation {
  station: StationView;
  distance: number;
}

/** Nearby active stations that still have bikes (start) or docks (end), nearest first. */
export function findAlternatives(
  stations: StationView[],
  origin: GeoPoint & { id: string },
  role: "start" | "end",
  { radiusMeters = 500, limit = 3 } = {},
): NearbyStation[] {
  return stations
    .filter(
      (station) =>
        station.id !== origin.id &&
        station.status === 1 &&
        (role === "start" ? station.available : station.empty) > 0,
    )
    .map((station) => ({ station, distance: getDistanceMeters(origin, station) }))
    .filter(({ distance }) => distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}
