import { expect, test } from "bun:test";
import {
  ALERT_COOLDOWN_MS,
  collectArrivalTargets,
  createArrivalMonitor,
  detectArrivals,
  INITIAL_ARRIVAL_STATE,
} from "../src/lib/arrival";
import { buildArrivalMessage } from "../src/lib/notification-messages";
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
    available: 4,
    empty: 6,
    total: 10,
    detail: { yb1: 0, yb2: 4, eyb: 0 },
    dockRatio: 0.6,
    updatedAt: "",
    ...overrides,
  };
}

const home = station("H");
const atStation = { lat: 25.04, lng: 121.5 };
const farAway = { lat: 25.05, lng: 121.5 }; // ~1.1 km
const boundary = { lat: 25.0418, lng: 121.5 }; // ~200 m: outside arrival, inside departure

test("trip roles override favorites and unknown ids are skipped", () => {
  const targets = collectArrivalTargets([home, station("W")], ["H", "W", "missing"], {
    startId: "H",
    endId: null,
  });
  expect(targets.map((t) => [t.station.id, t.role])).toEqual([
    ["H", "start"],
    ["W", "favorite"],
  ]);
});

test("alerts once on entry and not again while lingering near the boundary", () => {
  const targets = [{ station: home, role: "favorite" as const }];
  const first = detectArrivals(farAway, targets, INITIAL_ARRIVAL_STATE, 0);
  expect(first.arrivals).toHaveLength(0);

  const arrive = detectArrivals(atStation, targets, first.state, 1_000);
  expect(arrive.arrivals.map((a) => a.station.id)).toEqual(["H"]);

  const jitter = detectArrivals(boundary, targets, arrive.state, 2_000);
  expect(jitter.arrivals).toHaveLength(0);
  expect(jitter.state.inside).toEqual(["H"]);

  const back = detectArrivals(atStation, targets, jitter.state, 3_000);
  expect(back.arrivals).toHaveLength(0);
});

test("re-entering after leaving respects the cooldown", () => {
  const targets = [{ station: home, role: "favorite" as const }];
  const arrive = detectArrivals(atStation, targets, INITIAL_ARRIVAL_STATE, 0);
  const left = detectArrivals(farAway, targets, arrive.state, 60_000);
  expect(left.state.inside).toEqual([]);

  const soon = detectArrivals(atStation, targets, left.state, 120_000);
  expect(soon.arrivals).toHaveLength(0);

  const leftAgain = detectArrivals(farAway, targets, soon.state, 180_000);
  const later = detectArrivals(atStation, targets, leftAgain.state, ALERT_COOLDOWN_MS + 1);
  expect(later.arrivals).toHaveLength(1);
});

test("messages report bikes and docks, with an alternative when the trip station lacks them", () => {
  expect(buildArrivalMessage({ station: home, role: "favorite" })).toEqual({
    title: "已到達最愛站點：站點 H",
    body: "可借 4 輛 · 空位 6 格",
  });

  const full = station("F", { empty: 0, available: 10 });
  const nearby = station("N", { lat: 25.0405, empty: 3 });
  const message = buildArrivalMessage({ station: full, role: "end" }, [full, nearby]);
  expect(message.title).toBe("已到達終點：站點 F");
  expect(message.body).toStartWith("空位 0 格 · 可借 10 輛。附近「站點 N」空位 3 格");

  expect(buildArrivalMessage({ station: home, role: "start" }, [], { arrived: false }).title).toBe(
    "起點：站點 H",
  );

  expect(buildArrivalMessage({ station: station("C", { status: 0 }), role: "start" }).body).toBe(
    "此站暫停營運，請改用附近站點。",
  );
});

test("monitor re-checks the last fix when targets load after it", () => {
  let targets: { station: StationView; role: "favorite" }[] = [];
  const delivered: string[] = [];
  const monitor = createArrivalMonitor(
    () => targets,
    (arrivals) => delivered.push(...arrivals.map((a) => a.station.id)),
    () => 0,
  );

  monitor.update(atStation);
  expect(delivered).toEqual([]);

  targets = [{ station: home, role: "favorite" }];
  monitor.recheck();
  expect(delivered).toEqual(["H"]);

  // later target refreshes keep the enter state, so no duplicate alert
  monitor.recheck();
  expect(delivered).toEqual(["H"]);
});

test("stopping the monitor marks pending deliveries inactive and ignores later fixes", () => {
  const targets = [{ station: home, role: "favorite" as const }];
  const pending: (() => boolean)[] = [];
  const monitor = createArrivalMonitor(
    () => targets,
    (_arrivals, isActive) => pending.push(isActive),
    () => 0,
  );

  monitor.update(atStation);
  expect(pending).toHaveLength(1);
  expect(pending[0]?.()).toBe(true);

  monitor.stop();
  expect(pending[0]?.()).toBe(false);
  monitor.update(farAway);
  monitor.update(atStation);
  monitor.recheck();
  expect(pending).toHaveLength(1);
});
