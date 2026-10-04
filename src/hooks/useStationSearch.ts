import { useEffect, useMemo, useState } from "react";
import type { GeoPoint } from "../lib/distance";
import type { Area, StationView } from "../lib/schema";
import { filterStations, getStationAreas, getStationTotals } from "../lib/stations";

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
  const [visible, setVisible] = useState(PAGE_SIZE);

  const stationAreas = useMemo(() => getStationAreas(stations, areas), [stations, areas]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => filterStations(stations, { query: q, areaCode, favOnly, favorites, userLocation }),
    [stations, q, areaCode, favOnly, favorites, userLocation],
  );
  const totals = useMemo(() => getStationTotals(filtered), [filtered]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when any filter changes
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, areaCode, favOnly]);

  const showAll = () => {
    setAreaCode(null);
    setFavOnly(false);
  };
  const toggleArea = (code: string) => setAreaCode((prev) => (prev === code ? null : code));
  const toggleFavoritesOnly = () => setFavOnly((prev) => !prev);
  const loadMore = () => setVisible((prev) => prev + PAGE_SIZE);

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
