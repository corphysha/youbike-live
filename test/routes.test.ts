import { expect, test } from "bun:test";
import { buildRouteMessage } from "../src/lib/notification-messages";
import { routeId, toggleRoute } from "../src/lib/routes";
import type { StationView } from "../src/lib/schema";

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
    available: 7,
    empty: 3,
    total: 10,
    detail: { yb1: 0, yb2: 7, eyb: 0 },
    dockRatio: 0.3,
    updatedAt: "",
    ...overrides,
  };
}

test("saving the same start/end pair twice unsaves it; reversed pairs are distinct", () => {
  const saved = toggleRoute([], "A", "B");
  expect(saved.map((r) => r.id)).toEqual([routeId("A", "B")]);
  expect(toggleRoute(saved, "B", "A")).toHaveLength(2);
  expect(toggleRoute(saved, "A", "B")).toEqual([]);
});

test("route message reports start bikes and end docks in one notification", () => {
  const route = { id: routeId("A", "B"), startId: "A", endId: "B" };
  const start = station("A");
  const end = station("B", { lat: 25.06, empty: 0 });
  const nearEnd = station("C", { lat: 25.0603, empty: 9 });

  expect(buildRouteMessage(route, [start, end, nearEnd])).toEqual({
    title: "路線：站點 A → 站點 B",
    body: "起點可借 7 輛\n終點空位 0 格，附近「站點 C」空位 9 格（約 33 公尺）",
  });
});

test("route message explains missing or suspended stations", () => {
  const route = { id: routeId("A", "Z"), startId: "A", endId: "Z" };
  expect(buildRouteMessage(route, [station("A", { status: 0 })])).toEqual({
    title: "路線：站點 A → Z",
    body: "起點暫停營運\n終點站點資料不存在",
  });
});
