import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StationCard } from "../src/components/StationCard";
import type { StationView } from "../src/lib/schema";

const station: StationView = {
  id: "TPE001",
  name: "台北車站",
  nameEn: "Taipei Main Station",
  district: "中正區",
  address: "台北市中正區北平西路3號",
  areaCode: "TPE",
  lat: 25.03396,
  lng: 121.564472,
  status: 1,
  available: 3,
  empty: 7,
  total: 10,
  detail: { yb1: 0, yb2: 3, eyb: 0 },
  dockRatio: 0.7,
  updatedAt: "2026-10-03 12:00:00",
};

test("station list cards expose an accessible map navigation action", () => {
  const markup = renderToStaticMarkup(
    <StationCard
      station={station}
      isFav={false}
      now={new Date("2026-10-03T12:01:00Z")}
      onToggleFav={() => {}}
      onNavigateToStation={() => {}}
    />,
  );

  expect(markup).toContain('class="station-nav-button"');
  expect(markup).toContain('aria-label="開啟前往 台北車站 的步行導航"');
  expect(markup).toContain("導航");
});

test("station cards offer start and end trip actions when enabled", () => {
  const markup = renderToStaticMarkup(
    <StationCard
      station={station}
      isFav={false}
      now={new Date("2026-10-03T12:01:00Z")}
      onToggleFav={() => {}}
      onNavigateToStation={() => {}}
      tripRole="start"
      onToggleTripStation={() => {}}
    />,
  );

  expect(markup).toContain('aria-label="取消起點：台北車站"');
  expect(markup).toContain('aria-label="設為終點：台北車站"');
});

test("station cards show regular and electric bikes separately", () => {
  const markup = renderToStaticMarkup(
    <StationCard
      station={{ ...station, available: 5, detail: { yb1: 0, yb2: 3, eyb: 2 } }}
      isFav={false}
      now={new Date("2026-10-03T12:01:00Z")}
      onToggleFav={() => {}}
      onNavigateToStation={() => {}}
    />,
  );

  expect(markup).toContain("共可借 5 輛");
  expect(markup).toMatch(/num-regular"><div class="num">3<\/div>/);
  expect(markup).toMatch(/num-electric"><div class="num">2<\/div>/);
  expect(markup).toContain("一般車");
  expect(markup).toContain("電輔車");
});
