import { expect, test } from "bun:test";
import type { StationView } from "../src/lib/schema";
import {
  checkTripStation,
  findAlternatives,
  getTripRole,
  setTripStation,
  type Trip,
} from "../src/lib/trip";

function station(id: string, overrides: Partial<StationView> = {}): StationView {
  return {
    id,
    name: `站點 ${id}`,
    nameEn: "",
    district: "",
    address: "",
    areaCode: "00",
    lat: 25.04,
    lng: 121.5,
    status: 1,
    available: 5,
    empty: 5,
    total: 10,
    detail: { yb1: 0, yb2: 5, eyb: 0 },
    dockRatio: 0.5,
    updatedAt: "",
    ...overrides,
  };
}

test("setting a station on one end removes it from the other end", () => {
  const trip: Trip = { startId: "A", endId: "B" };
  expect(setTripStation(trip, "end", "A")).toEqual({ startId: null, endId: "A" });
  expect(setTripStation(trip, "start", "C")).toEqual({ startId: "C", endId: "B" });
  expect(getTripRole(trip, "B")).toBe("end");
  expect(getTripRole(trip, "Z")).toBeNull();
});

test("start checks bikes while end checks empty docks", () => {
  const busy = station("A", { available: 0, empty: 12 });
  expect(checkTripStation(busy, "start")).toBe("none");
  expect(checkTripStation(busy, "end")).toBe("ok");
  expect(checkTripStation(station("B", { available: 2 }), "start")).toBe("low");
  expect(checkTripStation(station("C", { status: 0 }), "end")).toBe("offline");
  expect(checkTripStation(null, "start")).toBe("missing");
});

test("alternatives are active nearby stations with capacity, nearest first", () => {
  const origin = station("O", { available: 0 });
  const near = station("N", { lat: 25.0405 }); // ~55 m
  const nearer = station("M", { lat: 25.0402 }); // ~22 m
  const empty = station("E", { lat: 25.0401, available: 0 });
  const closed = station("X", { lat: 25.0401, status: 0 });
  const far = station("F", { lat: 25.05 }); // ~1.1 km

  const result = findAlternatives([origin, near, nearer, empty, closed, far], origin, "start");
  expect(result.map(({ station: s }) => s.id)).toEqual(["M", "N"]);
});
