import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { GeoPoint } from "../lib/distance";
import type { Area, StationView } from "../lib/schema";
import {
  filterStations,
  getStationAreas,
  getStationTotals,
  normalizeStationQuery,
} from "../lib/stations";

const PAGE_SIZE = 40;

interface Options {
  stations: StationView[];
  areas: Area[];
  favorites: string[];
  userLocation: GeoPoint | null;
}

export function useStationSearch({ stations, areas, favorites, userLocation }: Options) {
  const [query, setQuery] = useState("");
  const [areaCode, setAreaCode] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [additionalCount, setAdditionalCount] = useState(0);
  const pageSize = userLocation ? 10 : PAGE_SIZE;
  const visible = pageSize + additionalCount;

  const stationAreas = useMemo(() => getStationAreas(stations, areas), [stations, areas]);
  // Keep typing urgent; nationwide filtering can render at a lower priority.
  const normalizedQuery = useDeferredValue(normalizeStationQuery(query));
  const filtered = useMemo(
    () => filterStations(stations, { normalizedQuery, areaCode, favOnly, favorites, userLocation }),
    [stations, normalizedQuery, areaCode, favOnly, favorites, userLocation],
  );
  const totals = useMemo(() => getStationTotals(filtered), [filtered]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when any filter changes
  useEffect(() => {
    setAdditionalCount(0);
  }, [query, areaCode, favOnly, pageSize, userLocation?.lat, userLocation?.lng]);

  const showAll = useCallback(() => {
    setAreaCode(null);
    setFavOnly(false);
  }, []);
  const toggleArea = useCallback(
    (code: string) => setAreaCode((prev) => (prev === code ? null : code)),
    [],
  );
  const toggleFavoritesOnly = useCallback(() => setFavOnly((prev) => !prev), []);
  const loadMore = useCallback(() => setAdditionalCount((prev) => prev + PAGE_SIZE), []);

  return {
    query,
    setQuery,
    areaCode,
    favOnly,
    setFavOnly,
    stationAreas,
    filtered,
    shown: filtered.slice(0, visible),
    remainingCount: Math.max(0, filtered.length - visible),
    ...totals,
    showAll,
    toggleArea,
    toggleFavoritesOnly,
    loadMore,
  };
}
