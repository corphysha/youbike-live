import { type GeoPoint, getDistanceMeters } from "./distance";
import { bikeCounts } from "./format";
import type { Area, StationView } from "./schema";

interface StationFilters {
  normalizedQuery: string;
  areaCode: string | null;
  favOnly: boolean;
  favorites: string[];
  userLocation: GeoPoint | null;
}

/** Only show areas present in the feed, in the official area's display order. */
export function getStationAreas(stations: StationView[], areas: Area[]) {
  const areaByCode = new Map(areas.map((area) => [area.area_code, area]));
  const codes = [...new Set(stations.map((station) => station.areaCode))];
  return codes
    .sort((a, b) => (areaByCode.get(a)?.sort ?? 99) - (areaByCode.get(b)?.sort ?? 99))
    .map((code) => ({ code, name: areaByCode.get(code)?.area_name_tw ?? code }));
}

/** A shared search key also keeps memoized results stable across equivalent queries. */
export function normalizeStationQuery(query: string): string {
  return query.trim().toLowerCase().replace(/台/g, "臺");
}

/** Accepts a normalized search key; distance sorting leaves the source feed untouched. */
export function filterStations(
  stations: StationView[],
  { normalizedQuery: q, areaCode, favOnly, favorites, userLocation }: StationFilters,
): StationView[] {
  const favSet = new Set(favorites);
  const norm = (text: string) => text.toLowerCase().replace(/台/g, "臺");
  const matches = stations.filter((station) => {
    if (favOnly && !favSet.has(station.id)) return false;
    if (areaCode && station.areaCode !== areaCode) return false;
    if (!q) return true;
    return (
      norm(station.name).includes(q) ||
      station.nameEn.toLowerCase().includes(q) ||
      norm(station.district).includes(q) ||
      norm(station.address).includes(q) ||
      station.id.includes(q)
    );
  });
  if (!userLocation) return matches;

  return matches
    .map((station) => ({ station, distance: getDistanceMeters(userLocation, station) }))
    .sort((a, b) => a.distance - b.distance)
    .map(({ station }) => station);
}

export function getStationTotals(stations: StationView[]) {
  return stations.reduce(
    (totals, station) => {
      if (station.status === 1) {
        totals.totalAvailable += station.available;
        totals.totalElectric += bikeCounts(station).electric;
        totals.totalEmpty += station.empty;
      }
      return totals;
    },
    { totalAvailable: 0, totalElectric: 0, totalEmpty: 0 },
  );
}
