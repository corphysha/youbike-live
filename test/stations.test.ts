import { describe, expect, test } from "bun:test";
import type { Area, StationView } from "../src/lib/schema";
import {
  filterStations,
  getStationAreas,
  getStationTotals,
  normalizeStationQuery,
} from "../src/lib/stations";

const station: StationView = {
  id: "500100001",
  name: "臺北車站",
  nameEn: "Taipei Main Station",
  district: "中正區",
  address: "台北市北平西路3號",
  areaCode: "00",
  lat: 25.0478,
  lng: 121.5319,
  status: 1,
  available: 3,
  empty: 7,
  total: 10,
  detail: { yb1: 0, yb2: 3, eyb: 0 },
  dockRatio: 0.7,
  updatedAt: "2026-10-03 12:00:00",
};

const stations: StationView[] = [
  station,
  {
    ...station,
    id: "500200002",
    areaCode: "01",
    name: "板橋車站",
    lat: 25.013,
    detail: { yb1: 0, yb2: 1, eyb: 2 },
  },
  { ...station, id: "500100003", name: "停用站", status: 0, lat: 25.06 },
];

const filters = {
  normalizedQuery: "",
  areaCode: null,
  favOnly: false,
  favorites: [] as string[],
  userLocation: null,
};

describe("station search", () => {
  test("equivalent whitespace, case and 台/臺 queries share one search key", () => {
    expect(normalizeStationQuery("  TAIPEI台  ")).toBe("taipei臺");
    expect(normalizeStationQuery(" 台北車站 ")).toBe(normalizeStationQuery("臺北車站"));
    expect(normalizeStationQuery("TAIPEI MAIN")).toBe(normalizeStationQuery(" taipei main "));
  });

  test("whitespace-only queries preserve the unfiltered feed", () => {
    expect(
      filterStations(stations, { ...filters, normalizedQuery: normalizeStationQuery(" \t\n ") }),
    ).toEqual(stations);
  });

  test.each([" 台北車站 ", "臺北車站", "TAIPEI MAIN", "中正", "臺北市", "500100001"])(
    "searches names, districts, addresses and IDs: %s",
    (query) => {
      expect(
        filterStations([station], { ...filters, normalizedQuery: normalizeStationQuery(query) }),
      ).toEqual([station]);
    },
  );

  test("combines query, area and favorites, including favorites missing from the feed", () => {
    expect(
      filterStations(stations, {
        ...filters,
        normalizedQuery: normalizeStationQuery("車站"),
        areaCode: "00",
        favOnly: true,
        favorites: [station.id, "500200002", "removed"],
      }),
    ).toEqual([station]);
    expect(filterStations(stations, { ...filters, favOnly: true })).toEqual([]);
    expect(
      filterStations(stations, { ...filters, normalizedQuery: normalizeStationQuery("不存在") }),
    ).toEqual([]);
  });

  test("preserves feed order without location and sorts by distance without mutating input", () => {
    const input = [...stations.slice(1), station];
    const before = [...input];
    expect(filterStations(input, filters)).toEqual(before);
    expect(filterStations(input, { ...filters, userLocation: station }).map((s) => s.id)).toEqual([
      station.id,
      "500100003",
      "500200002",
    ]);
    expect(input).toEqual(before);
  });

  test("keeps feed order for equal distances and places invalid coordinates last", () => {
    const samePosition = { ...station, id: "same-position" };
    const invalid = { ...station, id: "invalid", lat: Number.NaN };
    expect(
      filterStations([invalid, samePosition, station], { ...filters, userLocation: station }).map(
        (s) => s.id,
      ),
    ).toEqual([samePosition.id, station.id, invalid.id]);
  });
});

test("area options use official order, omit unused areas and fall back to missing area codes", () => {
  const area = (code: string, sort: number): Area => ({
    area_code: code,
    area_name_tw: `縣市${code}`,
    area_name_en: "",
    area_english: "",
    sort,
  });
  expect(
    getStationAreas(
      [...stations, { ...station, areaCode: "missing" }],
      [area("00", 2), area("01", 1), area("unused", 0)],
    ),
  ).toEqual([
    { code: "01", name: "縣市01" },
    { code: "00", name: "縣市00" },
    { code: "missing", name: "missing" },
  ]);
  expect(getStationAreas(stations, [])).toEqual([
    { code: "00", name: "00" },
    { code: "01", name: "01" },
  ]);
});

test("summary counts only active stations and handles empty results", () => {
  expect(getStationTotals(stations)).toEqual({
    totalAvailable: 6,
    totalElectric: 2,
    totalEmpty: 14,
  });
  expect(getStationTotals([])).toEqual({ totalAvailable: 0, totalElectric: 0, totalEmpty: 0 });
});
